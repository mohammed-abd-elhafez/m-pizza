import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/cart_models.dart';
import '../api/models/order_models.dart';
import '../cart/cart_notifier.dart';
import '../core/uuid.dart';
import 'payment_launcher.dart';
import 'validators.dart';

enum CheckoutProblem { none, missingLocation, invalidLandmark }

class CheckoutNotifier extends ChangeNotifier {
  CheckoutNotifier(
    this._api,
    this._cart, {
    PaymentLauncher? launcher,
    String Function()? newKey,
  }) : _launcher = launcher ?? const UrlPaymentLauncher(),
       _newKey = newKey ?? generateUuidV4;

  final ApiClient _api;
  final CartNotifier _cart;
  final PaymentLauncher _launcher;
  final String Function() _newKey;

  PaymentMethod _method = PaymentMethod.cod;
  bool _submitting = false;
  ApiException? _error;
  CheckoutProblem _problem = CheckoutProblem.none;
  String? _key;
  String? _keyPayload;

  PaymentMethod get method => _method;
  bool get submitting => _submitting;
  ApiException? get error => _error;
  CheckoutProblem get problem => _problem;

  /// The idempotency key of the current attempt (null before the first try).
  String? get idempotencyKey => _key;

  void setMethod(PaymentMethod m) {
    _method = m;
    notifyListeners();
  }

  /// Places the order. Returns the placed order, or null on failure
  /// (inspect [error] / [problem]).
  Future<PlacedOrder?> submit({Address? address, String? note}) async {
    if (_submitting) return null;
    final cart = _cart.orderRequest();
    _error = null;
    _problem = CheckoutProblem.none;
    if (cart == null) {
      _problem = CheckoutProblem.missingLocation;
      notifyListeners();
      return null;
    }
    final delivery = cart.service == ServiceType.delivery;
    if (delivery &&
        (address == null || validateLandmark(address.landmark) != null)) {
      _problem = CheckoutProblem.invalidLandmark;
      notifyListeners();
      return null;
    }
    final payload = jsonEncode({
      'cart': cart.toJson(),
      'address': delivery ? address?.toJson() : null,
      'method': _method.name,
      'note': note?.trim(),
    });
    // One key per attempt; a retry with the same payload reuses it, a changed
    // payload would be a CONFLICT so it gets a fresh key.
    if (_key == null || _keyPayload != payload) {
      _key = _newKey();
      _keyPayload = payload;
    }
    _submitting = true;
    notifyListeners();
    try {
      final placed = await _api.placeOrder(
        cart: cart,
        paymentMethod: _method,
        idempotencyKey: _key!,
        address: delivery ? address : null,
        note: note,
      );
      _key = null;
      _keyPayload = null;
      _cart.clear();
      if (_method == PaymentMethod.online) {
        await _openPayment(placed);
      }
      return placed;
    } on ApiException catch (e) {
      _error = e;
      if (e.code == 'CONFLICT') {
        _key = null;
        _keyPayload = null;
      }
      return null;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<void> _openPayment(PlacedOrder placed) async {
    try {
      final url =
          placed.redirectUrl ??
          await _api.startOnlinePayment(placed.trackingToken);
      await _launcher.open(url);
    } on ApiException {
      // The order exists; the tracking screen can retry payment later.
    }
  }
}

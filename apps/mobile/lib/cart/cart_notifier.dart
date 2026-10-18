import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/cart_models.dart';
import '../core/config.dart';

enum QuoteStatus { idle, loading, ready, error }

class CartNotifier extends ChangeNotifier {
  CartNotifier(
    this._api, {
    this._debounce = kPriceDebounce,
    this.pickupBranchId = kDefaultPickupBranchId,
  });

  final ApiClient _api;
  final Duration _debounce;
  final int pickupBranchId;

  List<CartLine> _lines = const [];
  ServiceType _service = ServiceType.delivery;
  GeoPoint? _location;
  PriceQuote? _quote;
  bool _provisional = false;
  QuoteStatus _status = QuoteStatus.idle;
  ApiException? _quoteError;
  Timer? _timer;
  int _seq = 0;
  bool _disposed = false;

  List<CartLine> get lines => _lines;
  ServiceType get service => _service;
  GeoPoint? get location => _location;
  PriceQuote? get quote => _quote;

  /// True when delivery has no location yet, so the quote was priced as
  /// pickup (subtotal only; the delivery fee is not final).
  bool get isProvisional => _provisional;
  QuoteStatus get status => _status;
  ApiException? get quoteError => _quoteError;
  bool get isEmpty => _lines.isEmpty;
  int get itemCount => _lines.fold(0, (n, l) => n + l.qty);

  /// The request for checkout, or null if a delivery location is missing.
  CartRequest? orderRequest() {
    if (_lines.isEmpty) return null;
    if (_service == ServiceType.delivery) {
      if (_location == null) return null;
      return CartRequest(
        service: ServiceType.delivery,
        location: _location,
        lines: _lines,
      );
    }
    return CartRequest(
      service: ServiceType.pickup,
      branchId: pickupBranchId,
      lines: _lines,
    );
  }

  void addLine(CartLine line) => _setLines([..._lines, line]);

  void replaceLine(int index, CartLine line) {
    if (index < 0 || index >= _lines.length) return;
    final next = [..._lines];
    next[index] = line;
    _setLines(next);
  }

  void removeLine(int index) {
    if (index < 0 || index >= _lines.length) return;
    _setLines([..._lines]..removeAt(index));
  }

  void setQty(int index, int qty) {
    if (index < 0 || index >= _lines.length) return;
    if (qty < 1) return removeLine(index);
    replaceLine(index, _lines[index].withQty(qty > 50 ? 50 : qty));
  }

  void replaceAll(List<CartLine> lines) => _setLines([...lines]);

  void clear() => _setLines(const []);

  void setService(ServiceType service) {
    if (service == _service) return;
    _service = service;
    _schedule();
  }

  void setLocation(GeoPoint? point) {
    _location = point;
    _schedule();
  }

  /// Prices immediately (used after reorder and in tests).
  Future<void> priceNow() {
    _timer?.cancel();
    return _price();
  }

  void _setLines(List<CartLine> lines) {
    _lines = List.unmodifiable(lines);
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    _seq++;
    if (_lines.isEmpty) {
      _quote = null;
      _quoteError = null;
      _status = QuoteStatus.idle;
      notifyListeners();
      return;
    }
    _status = QuoteStatus.loading;
    notifyListeners();
    _timer = Timer(_debounce, _price);
  }

  Future<void> _price() async {
    if (_lines.isEmpty) return;
    final seq = ++_seq;
    final located = _service == ServiceType.delivery && _location != null;
    final provisional = _service == ServiceType.delivery && !located;
    final request = provisional
        ? CartRequest(
            service: ServiceType.pickup,
            branchId: pickupBranchId,
            lines: _lines,
          )
        : CartRequest(
            service: _service,
            location: _location,
            branchId: _service == ServiceType.pickup ? pickupBranchId : null,
            lines: _lines,
          );
    _status = QuoteStatus.loading;
    if (!_disposed) notifyListeners();
    try {
      final q = await _api.priceCart(request);
      if (seq != _seq || _disposed) return;
      _quote = q;
      _provisional = provisional;
      _quoteError = null;
      _status = QuoteStatus.ready;
    } on ApiException catch (e) {
      if (seq != _seq || _disposed) return;
      _quoteError = e;
      _quote = null;
      _status = QuoteStatus.error;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}

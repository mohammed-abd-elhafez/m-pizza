import 'dart:async';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../api/models/order_models.dart';
import 'demo_menu.dart';

const int _kDeliveryFeePiastres = 1500;
const int _kMinDeliveryOrderPiastres = 8000;
const int _kEtaMinutes = 30;
const int _kMaxLineQty = 50;
const int _kMaxOrderUnits = 60;

ApiException _error(int status, String code, [String message = '']) =>
    ApiException(status: status, code: code, message: message);

class _DemoOrder {
  _DemoOrder({
    required this.token,
    required this.key,
    required this.service,
    required this.lines,
    required this.subtotal,
    required this.fee,
    required this.createdAt,
  });

  final String token;
  final String key;
  final ServiceType service;
  final List<CartLine> lines;
  final int subtotal;
  final int fee;
  final DateTime createdAt;

  int get total => subtotal + fee;
}

/// An in-memory stand-in for the M Pizza server, used by the public demo build so the app can be tried without a
/// backend. It applies the same pricing and validation rules as the real API and moves orders through the real
/// status timeline as time passes. No data leaves the browser and nothing is persisted.
class DemoApiClient implements ApiClient {
  DemoApiClient({this.step = const Duration(seconds: 6), DateTime Function()? now})
    : _now = now ?? DateTime.now;

  /// How long an order stays in each status.
  final Duration step;
  final DateTime Function() _now;

  final Menu _menu = Menu.fromJson(demoMenuJson);
  final List<_DemoOrder> _orders = [];

  @override
  String? authToken;

  void _requireLogin() {
    if (authToken == null) throw _error(401, 'UNAUTHORIZED', 'Sign in first');
  }

  @override
  Future<Menu> getMenu() async => _menu;

  @override
  Future<PriceQuote> priceCart(CartRequest cart) async {
    final subtotal = _subtotal(cart.lines, cart.service);
    final fee = cart.service == ServiceType.delivery ? _kDeliveryFeePiastres : 0;
    if (cart.service == ServiceType.delivery) {
      if (cart.location == null || !cart.location!.isValid) {
        throw _error(400, 'INVALID_REQUEST', 'Delivery requires a location');
      }
      if (subtotal.total < _kMinDeliveryOrderPiastres) {
        throw _error(422, 'BELOW_MINIMUM', 'Minimum order is $_kMinDeliveryOrderPiastres piastres');
      }
    } else if (cart.branchId != 1) {
      throw _error(422, 'BRANCH_UNAVAILABLE', 'Branch is not available');
    }
    return PriceQuote(
      subtotalPiastres: subtotal.total,
      deliveryFeePiastres: fee,
      totalPiastres: subtotal.total + fee,
      minOrderPiastres: cart.service == ServiceType.delivery ? _kMinDeliveryOrderPiastres : 0,
      etaMinutes: cart.service == ServiceType.delivery ? _kEtaMinutes : null,
      lines: [
        for (final u in subtotal.units)
          LineQuote(unitPiastres: u.unit, totalPiastres: u.total),
      ],
    );
  }

  ({int total, List<({int unit, int total})> units}) _subtotal(
    List<CartLine> lines,
    ServiceType service,
  ) {
    if (lines.isEmpty) throw _error(400, 'INVALID_REQUEST', 'Order has no lines');
    var units = 0;
    var total = 0;
    final priced = <({int unit, int total})>[];
    for (final line in lines) {
      if (line.qty < 1 || line.qty > _kMaxLineQty) {
        throw _error(422, 'INVALID_CART', 'Invalid qty (1..$_kMaxLineQty)');
      }
      units += line.qty;
      final unit = _unitPrice(line);
      priced.add((unit: unit, total: unit * line.qty));
      total += unit * line.qty;
    }
    if (units > _kMaxOrderUnits) throw _error(422, 'INVALID_CART', 'Too many items in one order');
    return (total: total, units: priced);
  }

  int _unitPrice(CartLine line) {
    final halves = line.halves;
    final pair = halves.length == 2 &&
        halves.any((h) => h.side == HalfSide.left) &&
        halves.any((h) => h.side == HalfSide.right);
    final whole = halves.length == 1 && halves.first.side == HalfSide.whole;
    if (!pair && !whole) throw _error(422, 'INVALID_CART', 'Invalid halves');

    var base = 0;
    var extras = 0;
    final labels = <String>{};
    var allPizza = true;
    for (final h in halves) {
      final item = _menu.itemById(h.itemId);
      if (item == null) throw _error(422, 'INVALID_CART', 'Unknown item ${h.itemId}');
      final size = item.sizeById(h.sizeId);
      if (size == null) throw _error(422, 'INVALID_CART', 'Unknown size ${h.sizeId}');
      if (!item.isPizza) {
        allPizza = false;
        if (h.toppings.isNotEmpty) throw _error(422, 'INVALID_CART', 'Toppings apply to pizza only');
      }
      labels.add(size.label);
      if (size.pricePiastres > base) base = size.pricePiastres;
      final seen = <int>{};
      for (final t in h.toppings) {
        final topping = _menu.toppingById(t.id);
        if (topping == null) throw _error(422, 'INVALID_CART', 'Unknown topping ${t.id}');
        if (!seen.add(t.id)) throw _error(422, 'INVALID_CART', 'Duplicate topping entry ${t.id}');
        if (t.action == ToppingAction.add) extras += topping.priceDeltaPiastres;
      }
    }
    if (halves.length == 2) {
      if (!allPizza) throw _error(422, 'INVALID_CART', 'Half-and-half applies to pizza only');
      if (labels.length != 1) throw _error(422, 'INVALID_CART', 'Half sizes must match');
    }
    var crust = 0;
    if (line.crustId != null) {
      if (!allPizza) throw _error(422, 'INVALID_CART', 'Crust applies to pizza only');
      final c = _menu.crustById(line.crustId!);
      if (c == null) throw _error(422, 'INVALID_CART', 'Unknown crust ${line.crustId}');
      crust = c.priceDeltaPiastres;
    }
    return base + crust + extras;
  }

  @override
  Future<void> requestOtp(String phone) async {
    if (phone.trim().isEmpty) throw _error(400, 'INVALID_REQUEST', 'Invalid phone');
  }

  @override
  Future<Session> verifyOtp(String phone, String code) async {
    // Demo only: any six-digit code signs in.
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      throw _error(401, 'UNAUTHORIZED', 'Invalid or expired code');
    }
    return Session(
      token: 'demo-session-token',
      expiresAt: _now().add(const Duration(days: 30)),
      phone: phone,
    );
  }

  @override
  Future<void> logout() async {
    authToken = null;
  }

  @override
  Future<PlacedOrder> placeOrder({
    required CartRequest cart,
    required PaymentMethod paymentMethod,
    required String idempotencyKey,
    Address? address,
    String? note,
  }) async {
    _requireLogin();
    final existing = _orders.where((o) => o.key == idempotencyKey);
    if (existing.isNotEmpty) return _placed(existing.first);

    final quote = await priceCart(cart);
    if (paymentMethod == PaymentMethod.online) {
      throw _error(400, 'INVALID_REQUEST', 'Online payment is not available');
    }
    if (cart.service == ServiceType.delivery && (address == null || address.landmark.trim().length < 3)) {
      throw _error(400, 'INVALID_REQUEST', 'Delivery requires an address');
    }
    final n = _orders.length + 1;
    final order = _DemoOrder(
      token: 'demo-order-${n.toString().padLeft(4, '0')}-${(_now().millisecondsSinceEpoch % 100000000).toRadixString(36)}',
      key: idempotencyKey,
      service: cart.service,
      lines: cart.lines,
      subtotal: quote.subtotalPiastres,
      fee: quote.deliveryFeePiastres,
      createdAt: _now(),
    );
    _orders.add(order);
    return _placed(order);
  }

  PlacedOrder _placed(_DemoOrder o) => PlacedOrder(
    trackingToken: o.token,
    status: _statusOf(o),
    paymentStatus: _paymentOf(o),
    totalPiastres: o.total,
  );

  OrderStatus _statusOf(_DemoOrder o) {
    final timeline = OrderStatus.timeline(o.service);
    final stepMs = step.inMilliseconds <= 0 ? 1 : step.inMilliseconds;
    final elapsed = _now().difference(o.createdAt).inMilliseconds;
    final index = (elapsed ~/ stepMs).clamp(0, timeline.length - 1);
    return timeline[index];
  }

  String _paymentOf(_DemoOrder o) =>
      _statusOf(o).isFinal ? 'COD_COLLECTED' : 'COD_PENDING';

  _DemoOrder _find(String token) {
    for (final o in _orders) {
      if (o.token == token) return o;
    }
    throw _error(404, 'NOT_FOUND', 'Order not found');
  }

  @override
  Future<List<OrderSummary>> listOrders() async {
    _requireLogin();
    return [
      for (final o in _orders.reversed)
        OrderSummary(
          trackingToken: o.token,
          status: _statusOf(o),
          paymentStatus: _paymentOf(o),
          service: o.service,
          totalPiastres: o.total,
          createdAt: o.createdAt,
          lines: o.lines,
        ),
    ];
  }

  @override
  Future<TrackedOrder> trackOrder(String trackingToken) async {
    final o = _find(trackingToken);
    return TrackedOrder(
      trackingToken: o.token,
      status: _statusOf(o),
      paymentStatus: _paymentOf(o),
      service: o.service,
      totalPiastres: o.total,
      subtotalPiastres: o.subtotal,
      deliveryFeePiastres: o.fee,
      createdAt: o.createdAt,
    );
  }

  @override
  Future<String> startOnlinePayment(String trackingToken) async {
    throw _error(400, 'INVALID_REQUEST', 'Online payment is not available');
  }

  @override
  Stream<StatusEvent> trackStream(String trackingToken) async* {
    final order = _find(trackingToken);
    final poll = Duration(milliseconds: (step.inMilliseconds ~/ 4).clamp(10, 500));
    OrderStatus? last;
    while (true) {
      final status = _statusOf(order);
      if (status != last) {
        last = status;
        yield StatusEvent(status: status, paymentStatus: _paymentOf(order));
      }
      if (status.isFinal) return;
      await Future<void>.delayed(poll);
    }
  }
}

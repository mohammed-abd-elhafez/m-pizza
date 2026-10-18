import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/menu_models.dart';
import '../api/models/order_models.dart';
import '../cart/cart_notifier.dart';
import '../cart/price_hint.dart';
import '../menu/menu_notifier.dart';

class ReorderResult {
  const ReorderResult({required this.added, required this.dropped});
  final int added;
  final int dropped;
}

class OrdersNotifier extends ChangeNotifier {
  OrdersNotifier(this._api);

  final ApiClient _api;

  LoadStatus _status = LoadStatus.idle;
  List<OrderSummary> _orders = const [];
  ApiException? _error;

  LoadStatus get status => _status;
  List<OrderSummary> get orders => _orders;
  ApiException? get error => _error;

  Future<void> load() async {
    _status = LoadStatus.loading;
    _error = null;
    notifyListeners();
    try {
      _orders = await _api.listOrders();
      _status = LoadStatus.ready;
    } on ApiException catch (e) {
      _error = e;
      _status = LoadStatus.error;
    }
    notifyListeners();
  }

  void reset() {
    _orders = const [];
    _status = LoadStatus.idle;
    _error = null;
    notifyListeners();
  }

  /// Puts the still-available lines of [order] into [cart] and re-prices them
  /// through the server. Lines referencing removed items are dropped.
  Future<ReorderResult> reorder(
    OrderSummary order,
    Menu menu,
    CartNotifier cart,
  ) async {
    final available = [
      for (final l in order.lines)
        if (isLineAvailable(l, menu)) l,
    ];
    final dropped = order.lines.length - available.length;
    if (available.isEmpty) return ReorderResult(added: 0, dropped: dropped);
    cart.replaceAll(available);
    await cart.priceNow();
    return ReorderResult(added: available.length, dropped: dropped);
  }
}

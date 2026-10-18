import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/cart_models.dart';
import '../api/models/order_models.dart';
import '../core/config.dart';

enum TrackingConnection { connecting, live, polling, finished }

/// Follows one order: WebSocket first, polling every 10 s if it fails.
class TrackingNotifier extends ChangeNotifier {
  TrackingNotifier(
    this._api,
    this.trackingToken, {
    this._pollInterval = kTrackingPollInterval,
  });

  final ApiClient _api;
  final String trackingToken;
  final Duration _pollInterval;

  TrackedOrder? _order;
  OrderStatus _status = OrderStatus.placed;
  String _paymentStatus = '';
  ApiException? _error;
  TrackingConnection _connection = TrackingConnection.connecting;
  StreamSubscription<StatusEvent>? _sub;
  Timer? _poll;
  bool _disposed = false;
  bool _started = false;

  TrackedOrder? get order => _order;
  OrderStatus get status => _status;
  String get paymentStatus => _paymentStatus;
  ApiException? get error => _error;
  TrackingConnection get connection => _connection;
  ServiceType get service => _order?.service ?? ServiceType.delivery;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    _openSocket();
    await refresh();
  }

  /// Fetches the order snapshot (also the polling step).
  Future<void> refresh() async {
    try {
      final o = await _api.trackOrder(trackingToken);
      if (_disposed) return;
      _order = o;
      _status = o.status;
      _paymentStatus = o.paymentStatus;
      _error = null;
      _finishIfFinal();
    } on ApiException catch (e) {
      if (_disposed) return;
      _error = e;
    }
    _notify();
  }

  void _openSocket() {
    _sub = _api
        .trackStream(trackingToken)
        .listen(
          _onEvent,
          onError: (Object _) => _fallBackToPolling(),
          onDone: _fallBackToPolling,
          cancelOnError: true,
        );
  }

  void _onEvent(StatusEvent e) {
    if (_disposed) return;
    _connection = TrackingConnection.live;
    _status = e.status;
    _paymentStatus = e.paymentStatus;
    _error = null;
    final o = _order;
    if (o != null) _order = o.withStatus(e.status, e.paymentStatus);
    _finishIfFinal();
    _notify();
  }

  void _fallBackToPolling() {
    if (_disposed || _status.isFinal || _poll != null) return;
    _connection = TrackingConnection.polling;
    _poll = Timer.periodic(_pollInterval, (_) => refresh());
    _notify();
  }

  void _finishIfFinal() {
    if (!_status.isFinal) return;
    _connection = TrackingConnection.finished;
    _poll?.cancel();
    _poll = null;
    _sub?.cancel();
    _sub = null;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}

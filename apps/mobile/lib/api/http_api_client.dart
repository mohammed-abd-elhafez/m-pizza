import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'api_client.dart';
import 'api_exception.dart';
import 'models/cart_models.dart';
import 'models/menu_models.dart';
import 'models/order_models.dart';

/// Opens a WebSocket and yields its text messages. Injected so tests can
/// supply a fake.
typedef SocketConnector = Stream<String> Function(Uri uri);

/// Default connector backed by `web_socket_channel`.
Stream<String> connectWebSocket(Uri uri) async* {
  final channel = WebSocketChannel.connect(uri);
  try {
    await channel.ready;
    await for (final message in channel.stream) {
      if (message is String) yield message;
    }
  } finally {
    await channel.sink.close();
  }
}

class HttpApiClient implements ApiClient {
  HttpApiClient({
    required String baseUrl,
    http.Client? httpClient,
    SocketConnector? connector,
    this.timeout = const Duration(seconds: 20),
  }) : _base = Uri.parse(
         baseUrl.endsWith('/')
             ? baseUrl.substring(0, baseUrl.length - 1)
             : baseUrl,
       ),
       _http = httpClient ?? http.Client(),
       _connect = connector ?? connectWebSocket;

  final Uri _base;
  final http.Client _http;
  final SocketConnector _connect;
  final Duration timeout;

  @override
  String? authToken;

  @override
  Future<Menu> getMenu() async => _parse(await _get('/menu'), Menu.fromJson);

  @override
  Future<PriceQuote> priceCart(CartRequest cart) async =>
      _parse(await _post('/cart/price', cart.toJson()), PriceQuote.fromJson);

  @override
  Future<void> requestOtp(String phone) async {
    await _post('/auth/otp/request', {'phone': phone});
  }

  @override
  Future<Session> verifyOtp(String phone, String code) async => _parse(
    await _post('/auth/otp/verify', {'phone': phone, 'code': code}),
    Session.fromJson,
  );

  @override
  Future<void> logout() async {
    await _post('/auth/logout', null, auth: true);
  }

  @override
  Future<PlacedOrder> placeOrder({
    required CartRequest cart,
    required PaymentMethod paymentMethod,
    required String idempotencyKey,
    Address? address,
    String? note,
  }) async {
    final body = <String, dynamic>{
      ...cart.toJson(),
      if (address != null) 'address': address.toJson(),
      'paymentMethod': paymentMethod.name,
      if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
    };
    return _parse(
      await _post(
        '/orders',
        body,
        auth: true,
        headers: {'Idempotency-Key': idempotencyKey},
      ),
      PlacedOrder.fromJson,
    );
  }

  @override
  Future<List<OrderSummary>> listOrders() async {
    final json = await _get('/orders', auth: true);
    return _parse(json, (j) {
      final orders = j is Map ? j['orders'] : null;
      if (orders is! List) throw const FormatException('Expected orders');
      return orders.map(OrderSummary.fromJson).toList(growable: false);
    });
  }

  @override
  Future<TrackedOrder> trackOrder(String trackingToken) async => _parse(
    await _get('/orders/track/${Uri.encodeComponent(trackingToken)}'),
    TrackedOrder.fromJson,
  );

  @override
  Future<String> startOnlinePayment(String trackingToken) async {
    final json = await _post(
      '/orders/track/${Uri.encodeComponent(trackingToken)}/checkout',
      null,
      auth: true,
    );
    return _parse(json, (j) {
      final payment = j is Map ? j['payment'] : null;
      final url = payment is Map ? payment['redirectUrl'] : null;
      if (url is! String || url.isEmpty) {
        throw const FormatException('Missing redirectUrl');
      }
      return url;
    });
  }

  @override
  Stream<StatusEvent> trackStream(String trackingToken) async* {
    final scheme = _base.scheme == 'https' ? 'wss' : 'ws';
    final uri = _base.replace(
      scheme: scheme,
      path:
          '${_base.path}/orders/track/'
          '${Uri.encodeComponent(trackingToken)}/stream',
    );
    await for (final raw in _connect(uri)) {
      Object? decoded;
      try {
        decoded = jsonDecode(raw);
      } on FormatException {
        continue;
      }
      final event = StatusEvent.tryParse(decoded);
      if (event != null) yield event;
    }
  }

  T _parse<T>(Object? json, T Function(Object?) parser) {
    try {
      return parser(json);
    } on FormatException {
      throw const ApiException(status: 502, code: 'BAD_RESPONSE');
    } on TypeError {
      throw const ApiException(status: 502, code: 'BAD_RESPONSE');
    }
  }

  Future<Object?> _get(String path, {bool auth = false}) =>
      _send('GET', path, null, auth: auth);

  Future<Object?> _post(
    String path,
    Object? body, {
    bool auth = false,
    Map<String, String> headers = const {},
  }) => _send('POST', path, body, auth: auth, extra: headers);

  Future<Object?> _send(
    String method,
    String path,
    Object? body, {
    bool auth = false,
    Map<String, String> extra = const {},
  }) async {
    final uri = _base.replace(path: '${_base.path}$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (auth && authToken != null) 'Authorization': 'Bearer $authToken',
      ...extra,
    };
    final http.Response res;
    try {
      final request = http.Request(method, uri)..headers.addAll(headers);
      if (body != null) request.body = jsonEncode(body);
      res = await http.Response.fromStream(
        await _http.send(request).timeout(timeout),
      );
    } on TimeoutException {
      throw const ApiException(status: 0, code: 'NETWORK');
    } on http.ClientException {
      throw const ApiException(status: 0, code: 'NETWORK');
    }
    return _decode(res);
  }

  Object? _decode(http.Response res) {
    Object? json;
    final text = utf8.decode(res.bodyBytes, allowMalformed: true);
    if (text.isNotEmpty) {
      try {
        json = jsonDecode(text);
      } on FormatException {
        json = null;
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (text.isNotEmpty && json == null) {
        throw const ApiException(status: 502, code: 'BAD_RESPONSE');
      }
      return json;
    }
    final error = json is Map ? json['error'] : null;
    final retry = int.tryParse(res.headers['retry-after'] ?? '');
    if (error is Map) {
      final fields = error['fields'];
      throw ApiException(
        status: res.statusCode,
        code: error['code'] is String ? error['code'] as String : 'INTERNAL',
        message: error['message'] is String ? error['message'] as String : '',
        fields: fields is List ? fields.whereType<String>().toList() : const [],
        retryAfterSeconds: retry,
      );
    }
    throw ApiException(
      status: res.statusCode,
      code: res.statusCode == 401 ? 'UNAUTHORIZED' : 'INTERNAL',
      retryAfterSeconds: retry,
    );
  }
}

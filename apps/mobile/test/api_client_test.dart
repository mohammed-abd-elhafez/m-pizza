import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mpizza_app/api/api_exception.dart';
import 'package:mpizza_app/api/http_api_client.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';

import 'support/fakes.dart';

http.Response jsonRes(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

HttpApiClient clientFor(
  Future<http.Response> Function(http.Request) handler, {
  SocketConnector? connector,
  Duration timeout = const Duration(seconds: 5),
}) => HttpApiClient(
  baseUrl: 'http://api.test:3000/',
  httpClient: MockClient(handler),
  connector: connector,
  timeout: timeout,
);

final cart = CartRequest(
  service: ServiceType.delivery,
  location: const GeoPoint(30.05, 31.23),
  lines: [marg()],
);

void main() {
  test('getMenu parses the response and calls GET /menu', () async {
    late http.Request seen;
    final api = clientFor((r) async {
      seen = r;
      return jsonRes(sampleMenuJson);
    });
    final menu = await api.getMenu();
    expect(seen.method, 'GET');
    expect(seen.url.toString(), 'http://api.test:3000/menu');
    expect(menu.categories, hasLength(2));
  });

  test('priceCart posts the cart and parses the quote', () async {
    late http.Request seen;
    final api = clientFor((r) async {
      seen = r;
      return jsonRes({
        'subtotalPiastres': 10000,
        'deliveryFeePiastres': 1500,
        'totalPiastres': 11500,
        'minOrderPiastres': 5000,
        'etaMinutes': 40,
        'lines': [
          {'unitPiastres': 10000, 'totalPiastres': 10000},
        ],
      });
    });
    final q = await api.priceCart(cart);
    expect(seen.url.path, '/cart/price');
    expect(seen.headers['Content-Type'], contains('application/json'));
    final body = jsonDecode(seen.body) as Map<String, dynamic>;
    expect(body['service'], 'delivery');
    expect(body.containsKey('totalPiastres'), isFalse);
    expect(q.totalPiastres, 11500);
  });

  test('OTP request/verify/logout use the right paths and bearer', () async {
    final seen = <http.Request>[];
    final api = clientFor((r) async {
      seen.add(r);
      if (r.url.path == '/auth/otp/request') {
        return jsonRes({'status': 'accepted'}, 202);
      }
      if (r.url.path == '/auth/otp/verify') {
        return jsonRes({
          'token': 'tok',
          'expiresAt': '2026-11-01T00:00:00Z',
          'phone': '+201012345678',
        });
      }
      return http.Response('', 204);
    });
    await api.requestOtp('+201012345678');
    final session = await api.verifyOtp('+201012345678', '123456');
    expect(session.token, 'tok');
    expect(jsonDecode(seen[1].body), {
      'phone': '+201012345678',
      'code': '123456',
    });
    expect(seen[0].headers.containsKey('Authorization'), isFalse);
    api.authToken = session.token;
    await api.logout();
    expect(seen[2].url.path, '/auth/logout');
    expect(seen[2].headers['Authorization'], 'Bearer tok');
  });

  test(
    'placeOrder sends Idempotency-Key, address and payment method',
    () async {
      late http.Request seen;
      final api = clientFor((r) async {
        seen = r;
        return jsonRes({
          'order': {
            'trackingToken': 'abc',
            'status': 'PLACED',
            'paymentStatus': 'COD_PENDING',
            'totalPiastres': 11500,
          },
          'payment': null,
        }, 201);
      })..authToken = 'tok';
      final placed = await api.placeOrder(
        cart: cart,
        paymentMethod: PaymentMethod.cod,
        idempotencyKey: 'key-0123456789abcdef',
        address: const Address(landmark: 'Next to the mosque'),
        note: 'ring twice',
      );
      expect(placed.trackingToken, 'abc');
      expect(seen.headers['Idempotency-Key'], 'key-0123456789abcdef');
      expect(seen.headers['Authorization'], 'Bearer tok');
      final body = jsonDecode(seen.body) as Map<String, dynamic>;
      expect(body['paymentMethod'], 'cod');
      expect(body['address'], {'landmark': 'Next to the mosque'});
      expect(body['note'], 'ring twice');
    },
  );

  test('listOrders, trackOrder and startOnlinePayment', () async {
    final api = clientFor((r) async {
      if (r.url.path == '/orders') {
        return jsonRes({
          'orders': [
            {
              'trackingToken': 't',
              'status': 'PLACED',
              'paymentStatus': 'COD_PENDING',
              'service': 'delivery',
              'totalPiastres': 100,
              'createdAt': '2026-10-01T12:30:00Z',
              'lines': [marg().toJson()],
            },
          ],
        });
      }
      if (r.url.path.endsWith('/checkout')) {
        return jsonRes({
          'payment': {'redirectUrl': 'https://pay.example/c'},
        });
      }
      return jsonRes({
        'order': {
          'trackingToken': 't',
          'status': 'READY',
          'paymentStatus': 'COD_PENDING',
          'totalPiastres': 100,
          'service': 'pickup',
          'subtotalPiastres': 100,
          'deliveryFeePiastres': 0,
          'branchPhone': null,
          'createdAt': '2026-10-01T12:30:00Z',
        },
      });
    });
    expect(await api.listOrders(), hasLength(1));
    final t = await api.trackOrder('a/b');
    expect(t.status, OrderStatus.ready);
    expect(await api.startOnlinePayment('t'), 'https://pay.example/c');
  });

  group('errors', () {
    test('maps the error envelope with code, fields and retry-after', () async {
      final api = clientFor(
        (r) async => http.Response(
          jsonEncode({
            'error': {
              'code': 'RATE_LIMITED',
              'message': 'slow down',
              'fields': ['phone'],
            },
          }),
          429,
          headers: {'retry-after': '30'},
        ),
      );
      try {
        await api.getMenu();
        fail('should throw');
      } on ApiException catch (e) {
        expect(e.status, 429);
        expect(e.code, 'RATE_LIMITED');
        expect(e.fields, ['phone']);
        expect(e.retryAfterSeconds, 30);
      }
    });

    test('401 without a body is UNAUTHORIZED', () async {
      final api = clientFor((r) async => http.Response('', 401));
      await expectLater(
        api.listOrders(),
        throwsA(
          isA<ApiException>().having(
            (e) => e.isUnauthorized,
            'isUnauthorized',
            isTrue,
          ),
        ),
      );
    });

    test('non-JSON error body is INTERNAL', () async {
      final api = clientFor((r) async => http.Response('<html>', 502));
      await expectLater(
        api.getMenu(),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INTERNAL')),
      );
    });

    test('malformed success body is BAD_RESPONSE', () async {
      final api = clientFor((r) async => jsonRes({'categories': 'x'}));
      await expectLater(
        api.getMenu(),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'BAD_RESPONSE'),
        ),
      );
      final api2 = clientFor((r) async => http.Response('not json', 200));
      await expectLater(
        api2.getMenu(),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'BAD_RESPONSE'),
        ),
      );
      final api3 = clientFor((r) async => jsonRes({'orders': 1}));
      await expectLater(api3.listOrders(), throwsA(isA<ApiException>()));
      final api4 = clientFor((r) async => jsonRes({'payment': {}}));
      await expectLater(
        api4.startOnlinePayment('t'),
        throwsA(isA<ApiException>()),
      );
    });

    test('transport failures become NETWORK', () async {
      final api = clientFor((r) async => throw http.ClientException('down'));
      await expectLater(
        api.getMenu(),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NETWORK')),
      );
      final slow = clientFor(
        (r) => Completer<http.Response>().future,
        timeout: const Duration(milliseconds: 20),
      );
      await expectLater(
        slow.getMenu(),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NETWORK')),
      );
    });
  });

  group('trackStream', () {
    test('connects to ws://.../stream and yields only status events', () async {
      final socket = FakeSocket();
      final api = clientFor(
        (r) async => jsonRes({}),
        connector: socket.connect,
      );
      final events = <StatusEvent>[];
      final done = api.trackStream('tok 1').forEach(events.add);
      socket.controller
        ..add('not json')
        ..add(jsonEncode({'type': 'hello'}))
        ..add(
          jsonEncode({
            'type': 'status',
            'status': 'PLACED',
            'paymentStatus': 'COD_PENDING',
          }),
        )
        ..add(
          jsonEncode({
            'type': 'status',
            'status': 'ACCEPTED',
            'paymentStatus': 'COD_PENDING',
          }),
        );
      await socket.controller.close();
      await done;
      expect(
        socket.lastUri.toString(),
        'ws://api.test:3000/orders/track/tok%201/stream',
      );
      expect(events.map((e) => e.status), [
        OrderStatus.placed,
        OrderStatus.accepted,
      ]);
    });

    test('https base uses wss and socket errors propagate', () async {
      final socket = FakeSocket();
      final api = HttpApiClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((r) async => jsonRes({})),
        connector: socket.connect,
      );
      final future = api.trackStream('t').toList();
      socket.controller.addError(StateError('closed'));
      await expectLater(future, throwsStateError);
      expect(socket.lastUri!.scheme, 'wss');
    });
  });
}

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/auth/auth_notifier.dart';
import 'package:mpizza_app/auth/session_store.dart';
import 'package:mpizza_app/cart/cart_notifier.dart';
import 'package:mpizza_app/checkout/checkout_notifier.dart';
import 'package:mpizza_app/checkout/payment_launcher.dart';
import 'package:mpizza_app/menu/menu_notifier.dart';
import 'package:mpizza_app/orders/orders_notifier.dart';
import 'package:mpizza_app/tracking/tracking_notifier.dart';

import 'support/fakes.dart';

class RecordingLauncher implements PaymentLauncher {
  final List<String> opened = [];
  @override
  Future<bool> open(String url) async {
    opened.add(url);
    return true;
  }
}

void main() {
  group('CartNotifier', () {
    late FakeApiClient api;
    late CartNotifier cart;
    setUp(() {
      api = FakeApiClient();
      cart = CartNotifier(api, debounce: const Duration(milliseconds: 10));
    });
    tearDown(() => cart.dispose());

    test('debounces pricing into a single request', () async {
      cart.addLine(marg());
      cart.addLine(marg());
      cart.setQty(0, 2);
      expect(cart.status, QuoteStatus.loading);
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(api.priceRequests, hasLength(1));
      expect(api.priceRequests.single.lines, hasLength(2));
      expect(cart.status, QuoteStatus.ready);
      expect(cart.quote!.totalPiastres, 11500);
      expect(cart.itemCount, 3);
    });

    test(
      'delivery without a location is priced as provisional pickup',
      () async {
        cart.addLine(marg());
        await cart.priceNow();
        expect(api.priceRequests.last.service, ServiceType.pickup);
        expect(api.priceRequests.last.branchId, 1);
        expect(cart.isProvisional, isTrue);
        expect(cart.orderRequest(), isNull);
        cart.setLocation(const GeoPoint(30, 31));
        await cart.priceNow();
        expect(api.priceRequests.last.service, ServiceType.delivery);
        expect(api.priceRequests.last.location, const GeoPoint(30, 31));
        expect(cart.isProvisional, isFalse);
        expect(cart.orderRequest()!.service, ServiceType.delivery);
      },
    );

    test('pickup uses the default branch', () async {
      cart.addLine(marg());
      cart.setService(ServiceType.pickup);
      cart.setService(ServiceType.pickup);
      await cart.priceNow();
      expect(api.priceRequests.last.branchId, 1);
      expect(cart.orderRequest()!.branchId, 1);
    });

    test('server errors are exposed and clear the quote', () async {
      api.onPrice = (_) async => throw apiError('OUT_OF_ZONE', 422);
      cart.addLine(marg());
      cart.setLocation(const GeoPoint(0, 0));
      await cart.priceNow();
      expect(cart.status, QuoteStatus.error);
      expect(cart.quoteError!.code, 'OUT_OF_ZONE');
      expect(cart.quote, isNull);
    });

    test('stale responses are ignored', () async {
      final first = Completer<PriceQuote>();
      var calls = 0;
      api.onPrice = (r) {
        calls++;
        return calls == 1
            ? first.future
            : Future.value(sampleQuote(subtotal: 20000));
      };
      cart.addLine(marg());
      final slow = cart.priceNow();
      cart.addLine(marg());
      await cart.priceNow();
      first.complete(sampleQuote(subtotal: 1));
      await slow;
      expect(cart.quote!.subtotalPiastres, 20000);
    });

    test('edit, remove and clear update lines and quote', () async {
      cart.addLine(marg());
      cart.replaceLine(0, marg(qty: 4));
      cart.replaceLine(9, marg());
      expect(cart.lines.single.qty, 4);
      cart.setQty(0, 100);
      expect(cart.lines.single.qty, 50);
      cart.removeLine(9);
      cart.setQty(9, 1);
      cart.setQty(0, 0);
      expect(cart.isEmpty, isTrue);
      expect(cart.status, QuoteStatus.idle);
      cart.replaceAll([marg(), marg()]);
      expect(cart.lines, hasLength(2));
      cart.clear();
      expect(cart.quote, isNull);
      expect(() => cart.lines.add(marg()), throwsUnsupportedError);
    });
  });

  group('CheckoutNotifier', () {
    late FakeApiClient api;
    late CartNotifier cart;
    var n = 0;
    String newKey() => 'key-${++n}-0123456789abcdef';

    setUp(() {
      n = 0;
      api = FakeApiClient();
      cart = CartNotifier(api, debounce: Duration.zero)
        ..addLine(marg())
        ..setLocation(const GeoPoint(30, 31));
    });
    tearDown(() => cart.dispose());

    const address = Address(landmark: 'Next to the mosque');

    test('success clears the cart and returns the order', () async {
      final c = CheckoutNotifier(api, cart, newKey: newKey);
      final placed = await c.submit(address: address);
      expect(placed!.trackingToken, 'tok-1234567890abcdef');
      expect(cart.isEmpty, isTrue);
      expect(api.placedKeys, ['key-1-0123456789abcdef']);
      expect(c.idempotencyKey, isNull);
    });

    test('reuses the idempotency key on retry with the same payload', () async {
      api.onPlaceOrder = (c, m, k) async => throw apiError('INTERNAL', 500);
      final c = CheckoutNotifier(api, cart, newKey: newKey);
      expect(await c.submit(address: address), isNull);
      expect(await c.submit(address: address), isNull);
      expect(api.placedKeys[0], api.placedKeys[1]);
      expect(c.error!.code, 'INTERNAL');
    });

    test(
      'uses a new key when the payload changed and after CONFLICT',
      () async {
        api.onPlaceOrder = (c, m, k) async => throw apiError('CONFLICT', 409);
        final c = CheckoutNotifier(api, cart, newKey: newKey);
        await c.submit(address: address);
        await c.submit(address: const Address(landmark: 'Other place'));
        await c.submit(address: const Address(landmark: 'Other place'));
        expect(api.placedKeys.toSet(), hasLength(3));
      },
    );

    test('delivery requires a valid landmark and a location', () async {
      final c = CheckoutNotifier(api, cart, newKey: newKey);
      await c.submit(address: const Address(landmark: 'ab'));
      expect(c.problem, CheckoutProblem.invalidLandmark);
      await c.submit();
      expect(c.problem, CheckoutProblem.invalidLandmark);
      cart.setLocation(null);
      await c.submit(address: address);
      expect(c.problem, CheckoutProblem.missingLocation);
      expect(api.placedKeys, isEmpty);
    });

    test('pickup needs no address and sends none', () async {
      cart.setService(ServiceType.pickup);
      final c = CheckoutNotifier(api, cart, newKey: newKey);
      expect(await c.submit(address: address), isNotNull);
      expect(api.placedAddresses.single, isNull);
    });

    test('ignores a second submit while one is in flight', () async {
      final gate = Completer<PlacedOrder>();
      api.onPlaceOrder = (c, m, k) => gate.future;
      final c = CheckoutNotifier(api, cart, newKey: newKey);
      final first = c.submit(address: address);
      expect(c.submitting, isTrue);
      expect(await c.submit(address: address), isNull);
      gate.complete(
        const PlacedOrder(
          trackingToken: 'tok-1234567890abcdef',
          status: OrderStatus.placed,
          paymentStatus: 'COD_PENDING',
          totalPiastres: 1,
        ),
      );
      await first;
      expect(api.placedKeys, hasLength(1));
    });

    test('online payment opens the redirect url (path kept ready)', () async {
      final launcher = RecordingLauncher();
      api.onPlaceOrder = (c, m, k) async => const PlacedOrder(
        trackingToken: 'tok-1234567890abcdef',
        status: OrderStatus.placed,
        paymentStatus: 'UNPAID',
        totalPiastres: 1,
        redirectUrl: 'https://pay.example/direct',
      );
      final c = CheckoutNotifier(api, cart, launcher: launcher, newKey: newKey)
        ..setMethod(PaymentMethod.online);
      expect(c.method, PaymentMethod.online);
      await c.submit(address: address);
      expect(launcher.opened, ['https://pay.example/direct']);
    });

    test(
      'online payment without redirect calls the checkout endpoint',
      () async {
        final launcher = RecordingLauncher();
        api.onPlaceOrder = (c, m, k) async => const PlacedOrder(
          trackingToken: 'tok-1234567890abcdef',
          status: OrderStatus.placed,
          paymentStatus: 'UNPAID',
          totalPiastres: 1,
        );
        final c = CheckoutNotifier(
          api,
          cart,
          launcher: launcher,
          newKey: newKey,
        )..setMethod(PaymentMethod.online);
        await c.submit(address: address);
        expect(launcher.opened, ['https://pay.example/checkout']);
      },
    );

    test('a failing payment start does not fail the placed order', () async {
      api.onStartPayment = (t) async => throw apiError('INTERNAL', 500);
      final launcher = RecordingLauncher();
      final c = CheckoutNotifier(api, cart, launcher: launcher, newKey: newKey)
        ..setMethod(PaymentMethod.online);
      expect(await c.submit(address: address), isNotNull);
      expect(launcher.opened, isEmpty);
    });

    test('UrlPaymentLauncher rejects non-http urls', () async {
      expect(
        await const UrlPaymentLauncher().open('javascript:alert(1)'),
        isFalse,
      );
      expect(await const UrlPaymentLauncher().open('::::'), isFalse);
    });
  });

  group('TrackingNotifier', () {
    test('socket events update the status live and stop at final', () async {
      final api = FakeApiClient();
      final ctrl = StreamController<StatusEvent>();
      api.onStream = (_) => ctrl.stream;
      final t = TrackingNotifier(
        api,
        'tok',
        pollInterval: const Duration(milliseconds: 20),
      );
      await t.start();
      await t.start();
      expect(t.order!.branchPhone, '+20221234567');
      ctrl.add(
        const StatusEvent(
          status: OrderStatus.preparing,
          paymentStatus: 'COD_PENDING',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(t.status, OrderStatus.preparing);
      expect(t.connection, TrackingConnection.live);
      expect(t.order!.status, OrderStatus.preparing);
      ctrl.add(
        const StatusEvent(
          status: OrderStatus.delivered,
          paymentStatus: 'COD_COLLECTED',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(t.connection, TrackingConnection.finished);
      expect(t.paymentStatus, 'COD_COLLECTED');
      t.dispose();
      await ctrl.close();
    });

    test(
      'falls back to polling when the socket fails, and stops on final',
      () async {
        final api = FakeApiClient();
        api.onStream = (_) => Stream<StatusEvent>.error(StateError('no ws'));
        var polls = 0;
        api.onTrack = (_) async {
          polls++;
          return sampleTracked(
            status: polls >= 3 ? OrderStatus.delivered : OrderStatus.accepted,
          );
        };
        final t = TrackingNotifier(
          api,
          'tok',
          pollInterval: const Duration(milliseconds: 15),
        );
        await t.start();
        await Future<void>.delayed(const Duration(milliseconds: 5));
        expect(t.connection, TrackingConnection.polling);
        await Future<void>.delayed(const Duration(milliseconds: 100));
        expect(t.status, OrderStatus.delivered);
        expect(t.connection, TrackingConnection.finished);
        final seen = polls;
        await Future<void>.delayed(const Duration(milliseconds: 60));
        expect(polls, seen);
        t.dispose();
      },
    );

    test('socket closing also falls back to polling', () async {
      final api = FakeApiClient();
      api.onStream = (_) => const Stream<StatusEvent>.empty();
      final t = TrackingNotifier(
        api,
        'tok',
        pollInterval: const Duration(milliseconds: 500),
      );
      await t.start();
      await Future<void>.delayed(Duration.zero);
      expect(t.connection, TrackingConnection.polling);
      t.dispose();
    });

    test('load failure is exposed', () async {
      final api = FakeApiClient();
      api.onTrack = (_) async => throw apiError('NOT_FOUND', 404);
      final t = TrackingNotifier(api, 'tok');
      await t.start();
      expect(t.error!.code, 'NOT_FOUND');
      expect(t.order, isNull);
      expect(t.service, ServiceType.delivery);
      t.dispose();
    });
  });

  group('AuthNotifier', () {
    late FakeApiClient api;
    late MemorySessionStore store;
    late AuthNotifier auth;
    setUp(() {
      api = FakeApiClient();
      store = MemorySessionStore();
      auth = AuthNotifier(api, store, clock: () => DateTime.utc(2026, 10, 18));
    });

    test('full login flow stores the session and token', () async {
      expect(await auth.requestCode('0101'), isFalse);
      expect(await auth.requestCode('٠١٠١٢٣٤٥٦٧٨'), isTrue);
      expect(api.otpRequests.single, '+201012345678');
      expect(auth.step, LoginStep.code);
      expect(await auth.verify('12'), isFalse);
      expect(await auth.verify('123456'), isTrue);
      expect(auth.isLoggedIn, isTrue);
      expect(api.authToken, 'session-token');
      expect(store.value!.token, 'session-token');
      expect(auth.phone, '+201012345678');
    });

    test('verify before requesting a code is rejected', () async {
      expect(await auth.verify('123456'), isFalse);
    });

    test('wrong code sets invalidCode, errors are kept', () async {
      await auth.requestCode('01012345678');
      api.onVerify = (p, c) async => throw apiError('UNAUTHORIZED', 401);
      expect(await auth.verify('123456'), isFalse);
      expect(auth.invalidCode, isTrue);
      api.onRequestOtp = (_) async => throw apiError('RATE_LIMITED', 429);
      expect(await auth.requestCode('01012345678'), isFalse);
      expect(auth.error!.code, 'RATE_LIMITED');
      auth.changeNumber();
      expect(auth.step, LoginStep.phone);
      expect(auth.error, isNull);
    });

    test(
      'logout calls the API and clears local state even on failure',
      () async {
        await auth.requestCode('01012345678');
        await auth.verify('123456');
        api.onLogout = () async => throw apiError('UNAUTHORIZED', 401);
        await auth.logout();
        expect(api.logoutCalls, 1);
        expect(auth.isLoggedIn, isFalse);
        expect(api.authToken, isNull);
        expect(store.value, isNull);
      },
    );

    test(
      'restore loads unexpired sessions and discards expired ones',
      () async {
        store.value = Session(
          token: 't',
          expiresAt: DateTime.utc(2026, 11, 1),
          phone: '+201012345678',
        );
        await auth.restore();
        expect(auth.isLoggedIn, isTrue);
        expect(api.authToken, 't');
        await auth.onUnauthorized();
        store.value = Session(
          token: 'old',
          expiresAt: DateTime.utc(2026, 1, 1),
          phone: '+201012345678',
        );
        await auth.restore();
        expect(auth.isLoggedIn, isFalse);
        expect(store.value, isNull);
        await auth.restore();
      },
    );
  });

  group('MenuNotifier and OrdersNotifier', () {
    test('menu load success and failure', () async {
      final api = FakeApiClient();
      final m = MenuNotifier(api);
      expect(m.status, LoadStatus.idle);
      await m.load();
      expect(m.status, LoadStatus.ready);
      api.onMenu = () async => throw apiError('NETWORK', 0);
      await m.load();
      expect(m.status, LoadStatus.error);
      expect(m.error!.code, 'NETWORK');
    });

    test('orders load, error, reset', () async {
      final api = FakeApiClient();
      final o = OrdersNotifier(api);
      await o.load();
      expect(o.orders, hasLength(1));
      api.onListOrders = () async => throw apiError('UNAUTHORIZED', 401);
      await o.load();
      expect(o.status, LoadStatus.error);
      o.reset();
      expect(o.orders, isEmpty);
      expect(o.status, LoadStatus.idle);
    });

    test(
      'reorder re-prices available lines and drops unavailable ones',
      () async {
        final api = FakeApiClient();
        final cart = CartNotifier(api, debounce: Duration.zero);
        final o = OrdersNotifier(api);
        final gone = CartLine(
          qty: 1,
          halves: const [
            PizzaHalf(side: HalfSide.whole, itemId: 404, sizeId: 1),
          ],
        );
        final result = await o.reorder(
          sampleOrder(lines: [marg(), gone]),
          sampleMenu(),
          cart,
        );
        expect(result.added, 1);
        expect(result.dropped, 1);
        expect(cart.lines, hasLength(1));
        expect(api.priceRequests, isNotEmpty);
        expect(cart.quote, isNotNull);
        final none = await o.reorder(
          sampleOrder(lines: [gone]),
          sampleMenu(),
          cart,
        );
        expect(none.added, 0);
        expect(none.dropped, 1);
        expect(cart.lines, hasLength(1));
        cart.dispose();
      },
    );
  });
}

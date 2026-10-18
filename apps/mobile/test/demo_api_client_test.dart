import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/api_exception.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/demo/demo_api_client.dart';

CartLine _line({
  int qty = 1,
  int? crustId,
  List<PizzaHalf>? halves,
}) => CartLine(
  qty: qty,
  crustId: crustId,
  halves:
      halves ??
      const [PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 12)],
);

const _near = GeoPoint(30.0444, 31.2357);

Future<ApiException> _failure(Future<Object?> Function() f) async {
  try {
    await f();
  } on ApiException catch (e) {
    return e;
  }
  fail('Expected an ApiException');
}

void main() {
  late DateTime clock;
  late DemoApiClient api;

  setUp(() {
    clock = DateTime.utc(2026, 10, 18, 12);
    api = DemoApiClient(
      step: const Duration(seconds: 10),
      now: () => clock,
    );
  });

  group('menu and pricing (same rules as the real server)', () {
    test('serves a pizza menu with sizes, crusts and toppings', () async {
      final menu = await api.getMenu();
      expect(menu.pizzasWithSize('M'), isNotEmpty);
      expect(menu.crusts, isNotEmpty);
      expect(menu.toppings, isNotEmpty);
      expect(menu.isEmpty, isFalse);
    });

    test('prices pickup with no delivery fee', () async {
      final menu = await api.getMenu();
      final price = menu.itemById(1)!.sizeById(12)!.pricePiastres;
      final quote = await api.priceCart(
        CartRequest(
          service: ServiceType.pickup,
          branchId: 1,
          lines: [_line()],
        ),
      );
      expect(quote.subtotalPiastres, price);
      expect(quote.deliveryFeePiastres, 0);
      expect(quote.totalPiastres, price);
    });

    test('delivery adds the zone fee and reports an ETA', () async {
      final quote = await api.priceCart(
        CartRequest(
          service: ServiceType.delivery,
          location: _near,
          lines: [_line(qty: 2)],
        ),
      );
      expect(quote.deliveryFeePiastres, 1500);
      expect(quote.totalPiastres, quote.subtotalPiastres + 1500);
      expect(quote.etaMinutes, isNotNull);
      expect(quote.lines.single.totalPiastres, quote.lines.single.unitPiastres * 2);
    });

    test('half-and-half costs the higher half plus crust plus added toppings', () async {
      final menu = await api.getMenu();
      final cheap = menu.itemById(1)!.sizeById(12)!.pricePiastres;
      final pricey = menu.itemById(3)!.sizeByLabel('M')!.pricePiastres;
      expect(pricey, greaterThan(cheap));
      final crust = menu.crusts.firstWhere((c) => c.priceDeltaPiastres > 0);
      final topping = menu.toppings.first;

      final quote = await api.priceCart(
        CartRequest(
          service: ServiceType.pickup,
          branchId: 1,
          lines: [
            CartLine(
              qty: 1,
              crustId: crust.id,
              halves: [
                PizzaHalf(
                  side: HalfSide.left,
                  itemId: 1,
                  sizeId: 12,
                  toppings: [ToppingChange(topping.id, ToppingAction.add)],
                ),
                PizzaHalf(
                  side: HalfSide.right,
                  itemId: 3,
                  sizeId: menu.itemById(3)!.sizeByLabel('M')!.id,
                  toppings: [ToppingChange(topping.id, ToppingAction.remove)],
                ),
              ],
            ),
          ],
        ),
      );
      expect(
        quote.subtotalPiastres,
        pricey + crust.priceDeltaPiastres + topping.priceDeltaPiastres,
      );
    });

    test('enforces the same validation as the server', () async {
      Future<Object?> price(CartLine l, {ServiceType s = ServiceType.pickup}) =>
          api.priceCart(
            CartRequest(
              service: s,
              branchId: s == ServiceType.pickup ? 1 : null,
              location: s == ServiceType.delivery ? _near : null,
              lines: [l],
            ),
          );

      expect((await _failure(() => price(_line(qty: 0)))).code, 'INVALID_CART');
      expect((await _failure(() => price(_line(qty: 51)))).code, 'INVALID_CART');
      expect(
        (await _failure(
          () => price(
            _line(halves: const [PizzaHalf(side: HalfSide.whole, itemId: 999, sizeId: 12)]),
          ),
        )).code,
        'INVALID_CART',
      );
      expect(
        (await _failure(
          () => price(
            _line(halves: const [PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 999)]),
          ),
        )).code,
        'INVALID_CART',
      );
      expect(
        (await _failure(
          () => api.priceCart(
            const CartRequest(service: ServiceType.delivery, lines: []),
          ),
        )).code,
        'INVALID_REQUEST',
      );
    });

    test('below-minimum delivery carts are refused like the real zone rule', () async {
      final menu = await api.getMenu();
      final drink = menu.categories
          .expand((c) => c.items)
          .firstWhere((i) => i.kind == 'drink');
      final e = await _failure(
        () => api.priceCart(
          CartRequest(
            service: ServiceType.delivery,
            location: _near,
            lines: [
              CartLine(
                qty: 1,
                halves: [
                  PizzaHalf(
                    side: HalfSide.whole,
                    itemId: drink.id,
                    sizeId: drink.sizes.first.id,
                  ),
                ],
              ),
            ],
          ),
        ),
      );
      expect(e.code, 'BELOW_MINIMUM');
    });
  });

  group('login', () {
    test('any six-digit code signs in; anything else is refused', () async {
      await api.requestOtp('+201012345678');
      final session = await api.verifyOtp('+201012345678', '123456');
      expect(session.phone, '+201012345678');
      expect(session.expiresAt.isAfter(clock), isTrue);
      expect((await _failure(() => api.verifyOtp('+201012345678', '12'))).status, 401);
      expect((await _failure(() => api.verifyOtp('+201012345678', 'abcdef'))).status, 401);
    });
  });

  group('orders and live tracking', () {
    Future<PlacedOrder> place({
      String key = 'key-1',
      ServiceType service = ServiceType.pickup,
    }) async {
      await api.verifyOtp('+201012345678', '123456').then((s) => api.authToken = s.token);
      return api.placeOrder(
        cart: CartRequest(
          service: service,
          branchId: service == ServiceType.pickup ? 1 : null,
          location: service == ServiceType.delivery ? _near : null,
          lines: [_line(qty: 2)],
        ),
        paymentMethod: PaymentMethod.cod,
        idempotencyKey: key,
        address: service == ServiceType.delivery
            ? const Address(landmark: 'Next to the mosque')
            : null,
      );
    }

    test('placing an order needs a signed-in customer', () async {
      final e = await _failure(
        () => api.placeOrder(
          cart: CartRequest(service: ServiceType.pickup, branchId: 1, lines: [_line()]),
          paymentMethod: PaymentMethod.cod,
          idempotencyKey: 'k',
        ),
      );
      expect(e.status, 401);
    });

    test('creates a cash order with a server-style total, and is idempotent per key', () async {
      final a = await place();
      expect(a.status, OrderStatus.placed);
      expect(a.paymentStatus, 'COD_PENDING');
      expect(a.trackingToken.length, greaterThanOrEqualTo(8));
      final again = await place();
      expect(again.trackingToken, a.trackingToken);
      expect((await api.listOrders()), hasLength(1));
      final other = await place(key: 'key-2');
      expect(other.trackingToken, isNot(a.trackingToken));
      expect((await api.listOrders()), hasLength(2));
    });

    test('the order moves through the real timeline as time passes', () async {
      final order = await place(service: ServiceType.delivery);
      Future<OrderStatus> status() async =>
          (await api.trackOrder(order.trackingToken)).status;

      expect(await status(), OrderStatus.placed);
      clock = clock.add(const Duration(seconds: 10));
      expect(await status(), OrderStatus.accepted);
      clock = clock.add(const Duration(seconds: 10));
      expect(await status(), OrderStatus.preparing);
      clock = clock.add(const Duration(seconds: 10));
      expect(await status(), OrderStatus.ready);
      clock = clock.add(const Duration(seconds: 10));
      expect(await status(), OrderStatus.outForDelivery);
      clock = clock.add(const Duration(seconds: 10));
      final done = await api.trackOrder(order.trackingToken);
      expect(done.status, OrderStatus.delivered);
      expect(done.paymentStatus, 'COD_COLLECTED');
      clock = clock.add(const Duration(hours: 1));
      expect((await status()), OrderStatus.delivered);
    });

    test('pickup orders end at picked-up', () async {
      final order = await place();
      clock = clock.add(const Duration(minutes: 5));
      expect((await api.trackOrder(order.trackingToken)).status, OrderStatus.pickedUp);
    });

    test('unknown tracking tokens are not found', () async {
      expect((await _failure(() => api.trackOrder('nope-nope-nope'))).status, 404);
    });

    test('the live stream emits the current status and then each change, then ends', () async {
      final order = await place();
      final fast = DemoApiClient(step: const Duration(milliseconds: 20));
      await fast.verifyOtp('+201012345678', '123456').then((s) => fast.authToken = s.token);
      final placed = await fast.placeOrder(
        cart: CartRequest(service: ServiceType.pickup, branchId: 1, lines: [_line()]),
        paymentMethod: PaymentMethod.cod,
        idempotencyKey: 'k',
      );
      final seen = await fast.trackStream(placed.trackingToken).map((e) => e.status).toList();
      expect(seen.first, OrderStatus.placed);
      expect(seen.last, OrderStatus.pickedUp);
      expect(seen, containsAllInOrder([OrderStatus.accepted, OrderStatus.preparing, OrderStatus.ready]));
      expect(order.trackingToken, isNotEmpty);
    });

    test('history entries can be re-priced for one-tap reorder', () async {
      await place();
      final history = await api.listOrders();
      expect(history.single.lines.single.qty, 2);
      final quote = await api.priceCart(
        CartRequest(service: ServiceType.pickup, branchId: 1, lines: history.single.lines),
      );
      expect(quote.subtotalPiastres, greaterThan(0));
    });

    test('online payment is not available in the demo, and logout clears the session', () async {
      final order = await place();
      expect((await _failure(() => api.startOnlinePayment(order.trackingToken))).status, 400);
      await api.logout();
      expect(api.authToken, isNull);
      expect((await _failure(() => api.listOrders())).status, 401);
    });
  });
}

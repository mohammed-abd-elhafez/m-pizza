import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/json_utils.dart';
import 'package:mpizza_app/api/models/menu_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';

import 'support/fakes.dart';

void main() {
  group('Menu', () {
    final menu = sampleMenu();

    test('parses categories, items, sizes, crusts and toppings', () {
      expect(menu.categories, hasLength(2));
      final marg = menu.itemById(1)!;
      expect(marg.nameAr, 'مارجريتا');
      expect(marg.sizes.map((s) => s.label), ['S', 'M', 'L']);
      expect(marg.fromPricePiastres, 8000);
      expect(marg.isPizza, isTrue);
      expect(menu.crustById(2)!.priceDeltaPiastres, 2500);
      expect(menu.toppingById(1)!.name('en'), 'Mushrooms');
      expect(menu.isEmpty, isFalse);
    });

    test('item without sizes is unavailable', () {
      final supreme = menu.itemById(3)!;
      expect(supreme.isAvailable, isFalse);
      expect(supreme.fromPricePiastres, isNull);
    });

    test('localised names fall back to the other language', () {
      final pep = menu.itemById(2)!;
      expect(pep.name('ar'), 'بيبروني');
      expect(pep.name('en'), 'Pepperoni');
      expect(pep.description('en'), '');
      expect(pickLang('en', 'ع', ''), 'ع');
      expect(pickLang('ar', '', 'E'), 'E');
    });

    test('pizzasWithSize filters pizzas by size label', () {
      expect(menu.pizzasWithSize('M').map((p) => p.id), [1, 2]);
      expect(menu.pizzasWithSize('regular'), isEmpty);
    });

    test('sizeById and sizeByLabel', () {
      final i = menu.itemById(1)!;
      expect(i.sizeById(12)!.label, 'M');
      expect(i.sizeById(99), isNull);
      expect(i.sizeByLabel('XL'), isNull);
    });

    test('malformed data throws FormatException', () {
      expect(() => Menu.fromJson('nope'), throwsFormatException);
      expect(
        () => MenuSize.fromJson({'id': 'x', 'label': 'S', 'pricePiastres': 1}),
        throwsFormatException,
      );
      expect(() => asString(1), throwsFormatException);
      expect(() => asList(1), throwsFormatException);
      expect(asInt(3.0), 3);
      expect(() => asInt(3.5), throwsFormatException);
    });
  });

  group('Cart models', () {
    test('CartLine round-trips through JSON', () {
      final json = {
        'qty': 2,
        'crustId': 3,
        'note': 'well done',
        'halves': [
          {
            'half': 'left',
            'itemId': 2,
            'sizeId': 5,
            'toppings': [
              {'id': 1, 'action': 'add'},
            ],
          },
          {
            'half': 'right',
            'itemId': 3,
            'sizeId': 8,
            'toppings': [
              {'id': 3, 'action': 'remove'},
            ],
          },
        ],
      };
      final line = CartLine.fromJson(json);
      expect(line.isHalfAndHalf, isTrue);
      expect(line.halves[1].toppings.single.action, ToppingAction.remove);
      expect(line.toJson(), json);
    });

    test('toJson omits empty note and absent crust', () {
      final j = CartLine(
        qty: 1,
        note: '  ',
        halves: const [PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 2)],
      ).toJson();
      expect(j.containsKey('note'), isFalse);
      expect(j.containsKey('crustId'), isFalse);
    });

    test('CartLine rejects 0 or 3 halves and unknown half', () {
      expect(
        () => CartLine.fromJson({'qty': 1, 'halves': <Object>[]}),
        throwsFormatException,
      );
      expect(
        () => PizzaHalf.fromJson({'half': 'top', 'itemId': 1, 'sizeId': 1}),
        throwsFormatException,
      );
    });

    test('CartRequest shape depends on the service', () {
      final delivery = CartRequest(
        service: ServiceType.delivery,
        location: const GeoPoint(30.05, 31.23),
        branchId: 9,
        lines: [marg()],
      ).toJson();
      expect(delivery['location'], {'lat': 30.05, 'lng': 31.23});
      expect(delivery.containsKey('branchId'), isFalse);
      final pickup = CartRequest(
        service: ServiceType.pickup,
        location: const GeoPoint(1, 1),
        branchId: 1,
        lines: [marg()],
      ).toJson();
      expect(pickup['branchId'], 1);
      expect(pickup.containsKey('location'), isFalse);
      expect(delivery.containsKey('price'), isFalse);
    });

    test('PriceQuote parsing and minimum check', () {
      final q = PriceQuote.fromJson({
        'subtotalPiastres': 4000,
        'deliveryFeePiastres': 1500,
        'totalPiastres': 5500,
        'minOrderPiastres': 5000,
        'etaMinutes': null,
        'lines': [
          {'unitPiastres': 4000, 'totalPiastres': 4000},
        ],
      });
      expect(q.belowMinimum, isTrue);
      expect(q.etaMinutes, isNull);
      expect(q.lines.single.totalPiastres, 4000);
    });

    test('GeoPoint validity and equality', () {
      expect(const GeoPoint(91, 0).isValid, isFalse);
      expect(const GeoPoint(30, 31), const GeoPoint(30, 31));
      expect(const GeoPoint(30, 31).hashCode, const GeoPoint(30, 31).hashCode);
    });

    test('ToppingChange equality', () {
      expect(
        const ToppingChange(1, ToppingAction.add),
        ToppingChange.fromJson({'id': 1, 'action': 'add'}),
      );
    });

    test('withQty keeps other fields', () {
      final l = marg().withQty(5);
      expect(l.qty, 5);
      expect(l.halves, hasLength(1));
    });
  });

  group('Order models', () {
    test('OrderStatus parse/final/timeline', () {
      expect(OrderStatus.parse('OUT_FOR_DELIVERY'), OrderStatus.outForDelivery);
      expect(OrderStatus.parse('???'), OrderStatus.unknown);
      expect(OrderStatus.delivered.isFinal, isTrue);
      expect(OrderStatus.preparing.isFinal, isFalse);
      expect(
        OrderStatus.timeline(ServiceType.pickup).last,
        OrderStatus.pickedUp,
      );
      expect(
        OrderStatus.timeline(ServiceType.delivery).last,
        OrderStatus.delivered,
      );
    });

    test('PlacedOrder with and without payment', () {
      final cod = PlacedOrder.fromJson({
        'order': {
          'trackingToken': 't',
          'status': 'PLACED',
          'paymentStatus': 'COD_PENDING',
          'totalPiastres': 100,
        },
        'payment': null,
      });
      expect(cod.redirectUrl, isNull);
      final online = PlacedOrder.fromJson({
        'order': {
          'trackingToken': 't',
          'status': 'PLACED',
          'paymentStatus': 'UNPAID',
          'totalPiastres': 100,
        },
        'payment': {'redirectUrl': 'https://pay.example/x'},
      });
      expect(online.redirectUrl, 'https://pay.example/x');
    });

    test('OrderSummary parses stored lines', () {
      final o = OrderSummary.fromJson({
        'trackingToken': 't',
        'status': 'DELIVERED',
        'paymentStatus': 'COD_COLLECTED',
        'service': 'pickup',
        'totalPiastres': 100,
        'createdAt': '2026-10-01T12:30:00.000Z',
        'lines': [marg().toJson()],
      });
      expect(o.service, ServiceType.pickup);
      expect(o.lines.single.halves.single.sizeId, 12);
    });

    test('TrackedOrder parse and withStatus', () {
      final t = TrackedOrder.fromJson({
        'order': {
          'trackingToken': 't',
          'status': 'READY',
          'paymentStatus': 'COD_PENDING',
          'totalPiastres': 11500,
          'service': 'delivery',
          'subtotalPiastres': 10000,
          'deliveryFeePiastres': 1500,
          'branchPhone': '+20221234567',
          'createdAt': '2026-10-01T12:30:00Z',
        },
      });
      expect(t.branchPhone, '+20221234567');
      final next = t.withStatus(OrderStatus.outForDelivery, 'COD_PENDING');
      expect(next.status, OrderStatus.outForDelivery);
      expect(next.totalPiastres, 11500);
    });

    test('StatusEvent only parses status messages', () {
      final e = StatusEvent.tryParse({
        'type': 'status',
        'status': 'ACCEPTED',
        'paymentStatus': 'PAID',
      });
      expect(e!.status, OrderStatus.accepted);
      expect(e.paymentStatus, 'PAID');
      expect(StatusEvent.tryParse({'type': 'ping'}), isNull);
      expect(StatusEvent.tryParse('x'), isNull);
    });

    test('Session parse and expiry', () {
      final s = Session.fromJson({
        'token': 'abc',
        'expiresAt': '2026-11-01T00:00:00Z',
        'phone': '+201012345678',
      });
      expect(s.isExpired(DateTime.utc(2026, 10, 1)), isFalse);
      expect(s.isExpired(DateTime.utc(2026, 12, 1)), isTrue);
    });

    test('Address JSON drops blank optional fields', () {
      final j = const Address(
        landmark: ' Next to mosque ',
        building: '12',
        floor: ' ',
      ).toJson();
      expect(j, {'landmark': 'Next to mosque', 'building': '12'});
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/cart/price_hint.dart';
import 'package:mpizza_app/menu/customizer_state.dart';

import 'support/fakes.dart';

void main() {
  final menu = sampleMenu();
  final marg1 = menu.itemById(1)!;

  group('estimateUnitPiastres (half-and-half display rules)', () {
    test('whole pizza = size price + crust + added toppings', () {
      final line = CartLine(
        qty: 1,
        crustId: 2,
        halves: const [
          PizzaHalf(
            side: HalfSide.whole,
            itemId: 1,
            sizeId: 12,
            toppings: [
              ToppingChange(1, ToppingAction.add),
              ToppingChange(2, ToppingAction.remove),
            ],
          ),
        ],
      );
      expect(estimateUnitPiastres(line, menu), 10000 + 2500 + 1500);
    });

    test('half-and-half = higher half + crust + extras of both halves', () {
      final line = CartLine(
        qty: 1,
        crustId: 2,
        halves: const [
          PizzaHalf(
            side: HalfSide.left,
            itemId: 1,
            sizeId: 12,
            toppings: [ToppingChange(1, ToppingAction.add)],
          ),
          PizzaHalf(
            side: HalfSide.right,
            itemId: 2,
            sizeId: 22,
            toppings: [ToppingChange(2, ToppingAction.add)],
          ),
        ],
      );
      // higher half 12000 + crust 2500 + 1500 + 1000
      expect(estimateUnitPiastres(line, menu), 17000);
    });

    test('unknown ids give null', () {
      final line = CartLine(
        qty: 1,
        halves: const [PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 99)],
      );
      expect(estimateUnitPiastres(line, menu), isNull);
      expect(
        estimateUnitPiastres(
          CartLine(
            qty: 1,
            crustId: 77,
            halves: const [
              PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 12),
            ],
          ),
          menu,
        ),
        isNull,
      );
      expect(
        estimateUnitPiastres(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(
                side: HalfSide.whole,
                itemId: 1,
                sizeId: 12,
                toppings: [ToppingChange(99, ToppingAction.add)],
              ),
            ],
          ),
          menu,
        ),
        isNull,
      );
    });
  });

  group('isLineAvailable', () {
    test('valid line, missing item, unavailable item, mixed sizes', () {
      expect(isLineAvailable(marg(), menu), isTrue);
      expect(
        isLineAvailable(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(side: HalfSide.whole, itemId: 404, sizeId: 1),
            ],
          ),
          menu,
        ),
        isFalse,
      );
      expect(
        isLineAvailable(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(side: HalfSide.whole, itemId: 3, sizeId: 1),
            ],
          ),
          menu,
        ),
        isFalse,
      );
      expect(
        isLineAvailable(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(side: HalfSide.left, itemId: 1, sizeId: 12),
              PizzaHalf(side: HalfSide.right, itemId: 2, sizeId: 23),
            ],
          ),
          menu,
        ),
        isFalse,
      );
      expect(
        isLineAvailable(
          CartLine(
            qty: 1,
            crustId: 55,
            halves: const [
              PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 12),
            ],
          ),
          menu,
        ),
        isFalse,
      );
      expect(
        isLineAvailable(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(
                side: HalfSide.whole,
                itemId: 1,
                sizeId: 12,
                toppings: [ToppingChange(55, ToppingAction.add)],
              ),
            ],
          ),
          menu,
        ),
        isFalse,
      );
    });
  });

  group('CustomizerState', () {
    test('initial picks size M and one whole half', () {
      final s = CustomizerState.initial(marg1);
      expect(s.sizeLabel, 'M');
      final line = s.toLine(menu)!;
      expect(line.halves.single.side, HalfSide.whole);
      expect(line.halves.single.sizeId, 12);
      expect(s.estimateUnit(menu), 10000);
    });

    test('half-and-half uses the same size for both halves', () {
      var s = CustomizerState.initial(marg1)
          .withHalfAndHalf(true)
          .withSecondItem(2)
          .withSize('L', menu);
      final line = s.toLine(menu)!;
      expect(line.halves.map((h) => h.side), [HalfSide.left, HalfSide.right]);
      expect(line.halves.map((h) => h.sizeId), [13, 23]);
      expect(s.estimateUnit(menu), 15000);
      s = s.withHalfAndHalf(false);
      expect(s.toLine(menu)!.halves, hasLength(1));
    });

    test('toggling a topping adds, switches and clears it per half', () {
      var s = CustomizerState.initial(marg1).withHalfAndHalf(true);
      s = s.toggleTopping(HalfSide.left, 1, ToppingAction.add);
      s = s.toggleTopping(HalfSide.right, 2, ToppingAction.remove);
      var line = s.toLine(menu)!;
      expect(line.halves[0].toppings.single.id, 1);
      expect(line.halves[1].toppings.single.action, ToppingAction.remove);
      s = s.toggleTopping(HalfSide.left, 1, ToppingAction.remove);
      expect(
        s.toLine(menu)!.halves[0].toppings.single.action,
        ToppingAction.remove,
      );
      s = s.toggleTopping(HalfSide.left, 1, ToppingAction.remove);
      expect(s.toLine(menu)!.halves[0].toppings, isEmpty);
      line = s.toLine(menu)!;
      expect(line.halves[1].toppings, hasLength(1));
    });

    test('crust, quantity limits and note', () {
      var s = CustomizerState.initial(marg1).withCrust(2).withQty(0);
      expect(s.qty, 1);
      s = s.withQty(99);
      expect(s.qty, 50);
      s = s.withNote('  extra crispy ');
      final line = s.toLine(menu)!;
      expect(line.crustId, 2);
      expect(line.note, 'extra crispy');
      expect(s.withCrust(null).toLine(menu)!.crustId, isNull);
    });

    test('non-pizza items never carry crust or toppings', () {
      final cola = menu.itemById(10)!;
      final s = CustomizerState.initial(cola)
          .toggleTopping(HalfSide.whole, 1, ToppingAction.add)
          .withCrust(1)
          .withHalfAndHalf(true);
      final line = s.toLine(menu)!;
      expect(s.sizeLabel, 'regular');
      expect(line.crustId, isNull);
      expect(line.halves.single.toppings, isEmpty);
      expect(line.halves, hasLength(1));
      expect(s.estimateUnit(menu), 2500);
    });

    test('changing size resets a second half that lacks the size', () {
      final s = CustomizerState.initial(marg1)
          .withHalfAndHalf(true)
          .withSecondItem(2)
          .withSize('regular', menu);
      expect(s.second.itemId, 1);
      expect(s.toLine(menu), isNull);
    });

    test('fromLine rebuilds state and rejects stale lines', () {
      final original = CustomizerState.initial(marg1)
          .withHalfAndHalf(true)
          .withSecondItem(2)
          .toggleTopping(HalfSide.right, 1, ToppingAction.add)
          .withCrust(1)
          .withQty(3)
          .withNote('hi')
          .withFirstItem(1)
          .toLine(menu)!;
      final s = CustomizerState.fromLine(original, menu)!;
      expect(s.halfAndHalf, isTrue);
      expect(s.qty, 3);
      expect(s.note, 'hi');
      expect(s.second.toppings[1], ToppingAction.add);
      expect(
        CustomizerState.fromLine(
          CartLine(
            qty: 1,
            halves: const [
              PizzaHalf(side: HalfSide.whole, itemId: 404, sizeId: 1),
            ],
          ),
          menu,
        ),
        isNull,
      );
    });
  });
}

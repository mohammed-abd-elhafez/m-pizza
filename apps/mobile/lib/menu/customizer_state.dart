import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../cart/price_hint.dart';

/// Toppings chosen for one pizza half.
class HalfSelection {
  const HalfSelection({required this.itemId, this.toppings = const {}});

  final int itemId;
  final Map<int, ToppingAction> toppings;

  HalfSelection withItem(int id) => HalfSelection(itemId: id);

  /// Cycles a topping: setting the same action again clears it.
  HalfSelection toggle(int toppingId, ToppingAction action) {
    final next = {...toppings};
    if (next[toppingId] == action) {
      next.remove(toppingId);
    } else {
      next[toppingId] = action;
    }
    return HalfSelection(itemId: itemId, toppings: Map.unmodifiable(next));
  }

  List<ToppingChange> toChanges() => [
    for (final e in toppings.entries) ToppingChange(e.key, e.value),
  ];
}

/// Immutable state of the pizza customiser. All rules live here, not in the
/// widget.
class CustomizerState {
  const CustomizerState({
    required this.sizeLabel,
    required this.first,
    required this.second,
    required this.halfAndHalf,
    required this.qty,
    this.crustId,
    this.note = '',
    this.isPizza = true,
  });

  factory CustomizerState.initial(MenuItem item) {
    final label = item.sizeByLabel('M') != null
        ? 'M'
        : (item.sizes.isEmpty ? 'regular' : item.sizes.first.label);
    return CustomizerState(
      sizeLabel: label,
      first: HalfSelection(itemId: item.id),
      second: HalfSelection(itemId: item.id),
      halfAndHalf: false,
      qty: 1,
      isPizza: item.isPizza,
    );
  }

  /// Rebuilds the state from an existing cart line, or null if the menu no
  /// longer matches it.
  static CustomizerState? fromLine(CartLine line, Menu menu) {
    if (!isLineAvailable(line, menu)) return null;
    final a = line.halves.first;
    final b = line.halves.length == 2 ? line.halves[1] : a;
    final item = menu.itemById(a.itemId)!;
    HalfSelection sel(PizzaHalf h) => HalfSelection(
      itemId: h.itemId,
      toppings: {for (final t in h.toppings) t.id: t.action},
    );
    return CustomizerState(
      sizeLabel: item.sizeById(a.sizeId)!.label,
      first: sel(a),
      second: sel(b),
      halfAndHalf: line.isHalfAndHalf,
      qty: line.qty,
      crustId: line.crustId,
      note: line.note ?? '',
      isPizza: item.isPizza,
    );
  }

  final String sizeLabel;
  final HalfSelection first;
  final HalfSelection second;
  final bool halfAndHalf;
  final int qty;
  final int? crustId;
  final String note;
  final bool isPizza;

  CustomizerState _copy({
    String? sizeLabel,
    HalfSelection? first,
    HalfSelection? second,
    bool? halfAndHalf,
    int? qty,
    int? Function()? crustId,
    String? note,
  }) => CustomizerState(
    sizeLabel: sizeLabel ?? this.sizeLabel,
    first: first ?? this.first,
    second: second ?? this.second,
    halfAndHalf: halfAndHalf ?? this.halfAndHalf,
    qty: qty ?? this.qty,
    crustId: crustId != null ? crustId() : this.crustId,
    note: note ?? this.note,
    isPizza: isPizza,
  );

  /// Changing size keeps only halves that exist at the new size.
  CustomizerState withSize(String label, Menu menu) {
    final ok = menu.pizzasWithSize(label).map((i) => i.id).toSet();
    final keepSecond = ok.contains(second.itemId);
    return _copy(
      sizeLabel: label,
      second: keepSecond ? second : HalfSelection(itemId: first.itemId),
    );
  }

  CustomizerState withHalfAndHalf(bool on) => _copy(halfAndHalf: on);
  CustomizerState withFirstItem(int id) => _copy(first: first.withItem(id));
  CustomizerState withSecondItem(int id) => _copy(second: second.withItem(id));
  CustomizerState withCrust(int? id) => _copy(crustId: () => id);
  CustomizerState withQty(int q) => _copy(qty: q < 1 ? 1 : (q > 50 ? 50 : q));
  CustomizerState withNote(String n) => _copy(note: n);

  CustomizerState toggleTopping(
    HalfSide side,
    int toppingId,
    ToppingAction action,
  ) => side == HalfSide.right
      ? _copy(second: second.toggle(toppingId, action))
      : _copy(first: first.toggle(toppingId, action));

  /// Builds the cart line; null if the menu lacks the chosen size.
  CartLine? toLine(Menu menu) {
    PizzaHalf? half(HalfSide side, HalfSelection s) {
      final size = menu.itemById(s.itemId)?.sizeByLabel(sizeLabel);
      if (size == null) return null;
      return PizzaHalf(
        side: side,
        itemId: s.itemId,
        sizeId: size.id,
        toppings: isPizza ? s.toChanges() : const [],
      );
    }

    final halves = <PizzaHalf>[];
    if (halfAndHalf && isPizza) {
      final l = half(HalfSide.left, first);
      final r = half(HalfSide.right, second);
      if (l == null || r == null) return null;
      halves.addAll([l, r]);
    } else {
      final w = half(HalfSide.whole, first);
      if (w == null) return null;
      halves.add(w);
    }
    final trimmed = note.trim();
    return CartLine(
      qty: qty,
      crustId: isPizza ? crustId : null,
      note: trimmed.isEmpty ? null : trimmed,
      halves: halves,
    );
  }

  /// Estimated price of one unit (display hint only).
  int? estimateUnit(Menu menu) {
    final line = toLine(menu);
    return line == null ? null : estimateUnitPiastres(line, menu);
  }
}

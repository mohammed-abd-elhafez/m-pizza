import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';

/// Display-only price estimate for one unit of a line. The server price from
/// `/cart/price` is always the authority.
///
/// Rule (mirrors the contract): the higher-priced half, plus the crust, plus
/// the added toppings of every half. Removing a topping is free.
/// Returns null when the menu does not contain the referenced entries.
int? estimateUnitPiastres(CartLine line, Menu menu) {
  var base = 0;
  var extras = 0;
  for (final half in line.halves) {
    final item = menu.itemById(half.itemId);
    final size = item?.sizeById(half.sizeId);
    if (size == null) return null;
    if (size.pricePiastres > base) base = size.pricePiastres;
    for (final t in half.toppings) {
      if (t.action != ToppingAction.add) continue;
      final topping = menu.toppingById(t.id);
      if (topping == null) return null;
      extras += topping.priceDeltaPiastres;
    }
  }
  if (line.crustId != null) {
    final crust = menu.crustById(line.crustId!);
    if (crust == null) return null;
    extras += crust.priceDeltaPiastres;
  }
  return base + extras;
}

/// True when every id referenced by [line] still exists on [menu] and every
/// item is orderable.
bool isLineAvailable(CartLine line, Menu menu) {
  for (final half in line.halves) {
    final item = menu.itemById(half.itemId);
    if (item == null || !item.isAvailable) return false;
    if (item.sizeById(half.sizeId) == null) return false;
    for (final t in half.toppings) {
      if (menu.toppingById(t.id) == null) return false;
    }
  }
  if (line.crustId != null && menu.crustById(line.crustId!) == null) {
    return false;
  }
  if (line.isHalfAndHalf) {
    final labels = {
      for (final h in line.halves)
        menu.itemById(h.itemId)!.sizeById(h.sizeId)!.label,
    };
    if (labels.length != 1) return false;
  }
  return true;
}

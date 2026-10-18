import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../l10n/l10n.dart';

class LineText {
  const LineText({
    required this.title,
    required this.details,
    required this.available,
  });

  final String title;
  final List<String> details;
  final bool available;
}

/// Human-readable description of a cart line (pure, no widgets).
LineText describeLine(
  AppLocalizations l,
  String lang,
  Menu menu,
  CartLine line,
) {
  final items = [for (final h in line.halves) menu.itemById(h.itemId)];
  if (items.any((i) => i == null)) {
    return LineText(
      title: l.cartLineUnavailable,
      details: const [],
      available: false,
    );
  }
  final size = items.first!.sizeById(line.halves.first.sizeId);
  final sizeText = size == null ? '' : ' · ${sizeName(l, size.label)}';
  final base = line.isHalfAndHalf
      ? l.cartLineHalves(items[0]!.name(lang), items[1]!.name(lang))
      : items.first!.name(lang);

  final added = <String>[];
  final removed = <String>[];
  for (final h in line.halves) {
    for (final t in h.toppings) {
      final name = menu.toppingById(t.id)?.name(lang);
      if (name == null) continue;
      (t.action == ToppingAction.add ? added : removed).add(name);
    }
  }
  final crust = line.crustId == null
      ? null
      : menu.crustById(line.crustId!)?.name(lang);
  return LineText(
    title: '$base$sizeText',
    available: true,
    details: [
      if (crust != null) l.cartLineCrust(crust),
      if (added.isNotEmpty) l.cartLineAdded(added.join(', ')),
      if (removed.isNotEmpty) l.cartLineRemoved(removed.join(', ')),
      if (line.note != null) l.cartLineNote(line.note!),
    ],
  );
}

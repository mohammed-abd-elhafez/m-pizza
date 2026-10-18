import 'package:flutter/material.dart';

import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../l10n/l10n.dart';
import 'customizer_state.dart';

/// The topping list of one pizza half: each topping can be added (with its
/// price delta) or removed (free).
class ToppingsPicker extends StatelessWidget {
  const ToppingsPicker({
    super.key,
    required this.toppings,
    required this.selection,
    required this.onToggle,
    required this.keyPrefix,
  });

  final List<MenuOption> toppings;
  final HalfSelection selection;
  final void Function(int id, ToppingAction action) onToggle;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Column(
      children: [
        for (final t in toppings)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Expanded(child: Text(t.name(context.lang))),
                Wrap(
                  spacing: 6,
                  children: [
                    FilterChip(
                      key: Key('$keyPrefix-add-${t.id}'),
                      label: Text(
                        '${l.toppingAdd} +${formatMoney(l, t.priceDeltaPiastres)}',
                      ),
                      selected: selection.toppings[t.id] == ToppingAction.add,
                      onSelected: (_) => onToggle(t.id, ToppingAction.add),
                    ),
                    FilterChip(
                      key: Key('$keyPrefix-remove-${t.id}'),
                      label: Text(l.toppingRemove),
                      selected:
                          selection.toppings[t.id] == ToppingAction.remove,
                      onSelected: (_) => onToggle(t.id, ToppingAction.remove),
                    ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Section for one half (or the whole pizza) with an optional pizza picker.
class HalfSection extends StatelessWidget {
  const HalfSection({
    super.key,
    required this.title,
    required this.selection,
    required this.toppings,
    required this.onToggle,
    required this.keyPrefix,
    this.pizzas,
    this.onPizzaChanged,
  });

  final String title;
  final HalfSelection selection;
  final List<MenuOption> toppings;
  final void Function(int id, ToppingAction action) onToggle;
  final String keyPrefix;
  final List<MenuItem>? pizzas;
  final ValueChanged<int>? onPizzaChanged;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final list = pizzas;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            if (list != null && onPizzaChanged != null) ...[
              const SizedBox(height: 8),
              DropdownButtonFormField<int>(
                key: Key('$keyPrefix-pizza'),
                initialValue: list.any((p) => p.id == selection.itemId)
                    ? selection.itemId
                    : null,
                isExpanded: true,
                decoration: InputDecoration(labelText: l.halfPickPizza),
                items: [
                  for (final p in list)
                    DropdownMenuItem(
                      value: p.id,
                      child: Text(
                        p.name(context.lang),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (v) {
                  if (v != null) onPizzaChanged!(v);
                },
              ),
            ],
            const SizedBox(height: 8),
            ToppingsPicker(
              toppings: toppings,
              selection: selection,
              onToggle: onToggle,
              keyPrefix: keyPrefix,
            ),
          ],
        ),
      ),
    );
  }
}

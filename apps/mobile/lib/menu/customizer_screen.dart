import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../cart/cart_notifier.dart';
import '../l10n/l10n.dart';
import '../theme/common_widgets.dart';
import 'customizer_state.dart';
import 'customizer_widgets.dart';
import 'menu_notifier.dart';

/// Add an item to the cart, or edit an existing cart line.
class CustomizerScreen extends StatefulWidget {
  const CustomizerScreen({
    super.key,
    required this.item,
    this.editIndex,
    this.initialLine,
  });

  final MenuItem item;
  final int? editIndex;
  final CartLine? initialLine;

  @override
  State<CustomizerScreen> createState() => _CustomizerScreenState();
}

class _CustomizerScreenState extends State<CustomizerScreen> {
  late CustomizerState _s;
  late final TextEditingController _note;

  @override
  void initState() {
    super.initState();
    final menu = context.read<MenuNotifier>().menu!;
    final line = widget.initialLine;
    _s =
        (line == null ? null : CustomizerState.fromLine(line, menu)) ??
        CustomizerState.initial(widget.item);
    _note = TextEditingController(text: _s.note);
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _set(CustomizerState next) => setState(() => _s = next);

  void _submit(Menu menu) {
    final line = _s.toLine(menu);
    if (line == null) return;
    final cart = context.read<CartNotifier>();
    if (widget.editIndex != null) {
      cart.replaceLine(widget.editIndex!, line);
    } else {
      cart.addLine(line);
    }
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(context.l10n.addedToCart)));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final menu = context.watch<MenuNotifier>().menu!;
    final item = menu.itemById(_s.first.itemId) ?? widget.item;
    final estimate = _s.estimateUnit(menu);
    final pizzas = menu.pizzasWithSize(_s.sizeLabel);
    return Scaffold(
      appBar: AppBar(title: Text(widget.item.name(context.lang))),
      body: ContentWidth(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (widget.item.description(context.lang).isNotEmpty)
              Text(widget.item.description(context.lang)),
            const SizedBox(height: 16),
            _title(context, l.customizeSize),
            Wrap(
              spacing: 8,
              children: [
                for (final s in widget.item.sizes)
                  ChoiceChip(
                    key: Key('size-${s.label}'),
                    label: Text(
                      '${sizeName(l, s.label)} · '
                      '${formatMoney(l, s.pricePiastres)}',
                    ),
                    selected: _s.sizeLabel == s.label,
                    onSelected: (_) => _set(_s.withSize(s.label, menu)),
                  ),
              ],
            ),
            if (widget.item.isPizza) ..._pizzaSections(context, menu, pizzas),
            const SizedBox(height: 16),
            _title(context, l.customizeQuantity),
            Row(
              children: [
                IconButton.outlined(
                  tooltip: l.cartQtyDecrease,
                  onPressed: _s.qty > 1
                      ? () => _set(_s.withQty(_s.qty - 1))
                      : null,
                  icon: const Icon(Icons.remove),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    '${_s.qty}',
                    key: const Key('qty'),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton.outlined(
                  tooltip: l.cartQtyIncrease,
                  onPressed: _s.qty < 50
                      ? () => _set(_s.withQty(_s.qty + 1))
                      : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('note'),
              controller: _note,
              maxLength: 200,
              decoration: InputDecoration(labelText: l.customizeNote),
              onChanged: (v) => _s = _s.withNote(v),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: ContentWidth(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (estimate != null)
                  Text(
                    l.customizeEstimate(formatMoney(l, estimate * _s.qty)),
                    key: const Key('estimate'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                Text(
                  l.customizeEstimateHint,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    key: const Key('submit'),
                    onPressed: item.isAvailable && estimate != null
                        ? () => _submit(menu)
                        : null,
                    child: Text(
                      widget.editIndex != null
                          ? l.customizeUpdate
                          : l.customizeAdd,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _title(BuildContext context, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );

  List<Widget> _pizzaSections(
    BuildContext context,
    Menu menu,
    List<MenuItem> pizzas,
  ) {
    final l = context.l10n;
    return [
      const SizedBox(height: 16),
      _title(context, l.customizeCrust),
      Wrap(
        spacing: 8,
        children: [
          ChoiceChip(
            key: const Key('crust-none'),
            label: Text(l.crustStandard),
            selected: _s.crustId == null,
            onSelected: (_) => _set(_s.withCrust(null)),
          ),
          for (final c in menu.crusts)
            ChoiceChip(
              key: Key('crust-${c.id}'),
              label: Text(
                c.priceDeltaPiastres == 0
                    ? c.name(context.lang)
                    : '${c.name(context.lang)} +'
                          '${formatMoney(l, c.priceDeltaPiastres)}',
              ),
              selected: _s.crustId == c.id,
              onSelected: (_) => _set(_s.withCrust(c.id)),
            ),
        ],
      ),
      const SizedBox(height: 16),
      Card(
        child: SwitchListTile(
          key: const Key('half-switch'),
          title: Text(l.halfAndHalfTitle),
          subtitle: Text(l.halfAndHalfSubtitle),
          value: _s.halfAndHalf,
          onChanged: (v) => _set(_s.withHalfAndHalf(v)),
        ),
      ),
      if (_s.halfAndHalf)
        Container(
          key: const Key('half-note'),
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline),
              const SizedBox(width: 8),
              Expanded(child: Text(l.halfAndHalfPriceNote)),
            ],
          ),
        ),
      const SizedBox(height: 8),
      _title(context, l.customizeToppings),
      Text(l.toppingsHint),
      const SizedBox(height: 8),
      if (!_s.halfAndHalf)
        HalfSection(
          title: l.halfWhole,
          keyPrefix: 'whole',
          selection: _s.first,
          toppings: menu.toppings,
          onToggle: (id, a) => _set(_s.toggleTopping(HalfSide.whole, id, a)),
        )
      else ...[
        HalfSection(
          title: l.halfLeft,
          keyPrefix: 'left',
          selection: _s.first,
          toppings: menu.toppings,
          pizzas: pizzas,
          onPizzaChanged: (id) => _set(_s.withFirstItem(id)),
          onToggle: (id, a) => _set(_s.toggleTopping(HalfSide.left, id, a)),
        ),
        HalfSection(
          title: l.halfRight,
          keyPrefix: 'right',
          selection: _s.second,
          toppings: menu.toppings,
          pizzas: pizzas,
          onPizzaChanged: (id) => _set(_s.withSecondItem(id)),
          onToggle: (id, a) => _set(_s.toggleTopping(HalfSide.right, id, a)),
        ),
      ],
    ];
  }
}

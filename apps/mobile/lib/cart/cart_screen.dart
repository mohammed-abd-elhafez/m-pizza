import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/cart_models.dart';
import '../api/models/menu_models.dart';
import '../auth/auth_notifier.dart';
import '../auth/login_screen.dart';
import '../checkout/checkout_screen.dart';
import '../checkout/location_screen.dart';
import '../l10n/l10n.dart';
import '../menu/customizer_screen.dart';
import '../menu/menu_notifier.dart';
import '../theme/common_widgets.dart';
import 'cart_notifier.dart';
import 'cart_totals.dart';
import 'line_summary.dart';
import 'price_hint.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key, this.onBrowse});

  /// Switches the home shell to the menu tab.
  final VoidCallback? onBrowse;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cart = context.watch<CartNotifier>();
    final menu = context.watch<MenuNotifier>().menu;
    if (cart.isEmpty) {
      return EmptyView(
        icon: Icons.shopping_cart_outlined,
        title: l.cartEmptyTitle,
        body: l.cartEmptyBody,
        action: onBrowse == null
            ? null
            : FilledButton(onPressed: onBrowse, child: Text(l.cartBrowse)),
      );
    }
    return ContentWidth(
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _FulfilmentPicker(cart: cart),
          const SizedBox(height: 8),
          for (var i = 0; i < cart.lines.length; i++)
            _LineCard(index: i, cart: cart, menu: menu),
          const SizedBox(height: 8),
          CartTotals(cart: cart),
          const SizedBox(height: 12),
          _CheckoutButton(cart: cart),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _FulfilmentPicker extends StatelessWidget {
  const _FulfilmentPicker({required this.cart});
  final CartNotifier cart;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final loc = cart.location;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SegmentedButton<ServiceType>(
              key: const Key('service'),
              segments: [
                ButtonSegment(
                  value: ServiceType.delivery,
                  icon: const Icon(Icons.delivery_dining),
                  label: Text(l.serviceDelivery),
                ),
                ButtonSegment(
                  value: ServiceType.pickup,
                  icon: const Icon(Icons.storefront),
                  label: Text(l.servicePickup),
                ),
              ],
              selected: {cart.service},
              onSelectionChanged: (s) => cart.setService(s.first),
            ),
            const SizedBox(height: 8),
            if (cart.service == ServiceType.pickup)
              Text(l.cartPickupFrom)
            else ...[
              if (loc == null)
                Text(l.cartLocationNeeded)
              else
                Text(
                  l.cartLocationSet(
                    loc.lat.toStringAsFixed(4),
                    loc.lng.toStringAsFixed(4),
                  ),
                ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  key: const Key('choose-location'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const LocationScreen(),
                    ),
                  ),
                  icon: const Icon(Icons.place_outlined),
                  label: Text(
                    loc == null ? l.cartChooseLocation : l.cartChangeLocation,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.index,
    required this.cart,
    required this.menu,
  });

  final int index;
  final CartNotifier cart;
  final Menu? menu;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final line = cart.lines[index];
    final m = menu;
    final text = m == null ? null : describeLine(l, context.lang, m, line);
    final quote = cart.quote;
    final server = quote != null && quote.lines.length == cart.lines.length
        ? quote.lines[index].totalPiastres
        : null;
    final hint = m == null ? null : estimateUnitPiastres(line, m);
    return Card(
      key: Key('line-$index'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    text?.title ?? l.cartLineUnavailable,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                if (server != null)
                  Text(
                    formatMoney(l, server),
                    style: Theme.of(context).textTheme.titleMedium,
                  )
                else if (hint != null)
                  Text(
                    '~${formatMoney(l, hint * line.qty)}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
              ],
            ),
            for (final d in text?.details ?? const <String>[]) Text(d),
            const SizedBox(height: 8),
            Row(
              children: [
                IconButton.outlined(
                  tooltip: l.cartQtyDecrease,
                  onPressed: () => cart.setQty(index, line.qty - 1),
                  icon: const Icon(Icons.remove),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('${line.qty}'),
                ),
                IconButton.outlined(
                  tooltip: l.cartQtyIncrease,
                  onPressed: () => cart.setQty(index, line.qty + 1),
                  icon: const Icon(Icons.add),
                ),
                const Spacer(),
                if (text?.available ?? false)
                  IconButton(
                    key: Key('edit-$index'),
                    tooltip: l.cartEdit,
                    onPressed: () => _edit(context, m!, line),
                    icon: const Icon(Icons.edit_outlined),
                  ),
                IconButton(
                  key: Key('remove-$index'),
                  tooltip: l.cartRemove,
                  onPressed: () => cart.removeLine(index),
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _edit(BuildContext context, Menu menu, CartLine line) {
    final item = menu.itemById(line.halves.first.itemId);
    if (item == null) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            CustomizerScreen(item: item, editIndex: index, initialLine: line),
      ),
    );
  }
}

class _CheckoutButton extends StatelessWidget {
  const _CheckoutButton({required this.cart});
  final CartNotifier cart;

  Future<void> _go(BuildContext context) async {
    final nav = Navigator.of(context);
    if (cart.service == ServiceType.delivery && cart.location == null) {
      await nav.push(
        MaterialPageRoute<void>(builder: (_) => const LocationScreen()),
      );
      return;
    }
    if (!context.read<AuthNotifier>().isLoggedIn) {
      final ok = await nav.push<bool>(
        MaterialPageRoute<bool>(builder: (_) => const LoginScreen()),
      );
      if (ok != true) return;
    }
    await nav.push(
      MaterialPageRoute<void>(builder: (_) => const CheckoutScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final blocked = cart.quote?.belowMinimum ?? false;
    final waiting = cart.status == QuoteStatus.loading;
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        key: const Key('checkout'),
        onPressed: blocked || waiting ? null : () => _go(context),
        child: Text(context.l10n.cartCheckout),
      ),
    );
  }
}

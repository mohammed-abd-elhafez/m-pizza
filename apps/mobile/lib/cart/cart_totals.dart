import 'package:flutter/material.dart';

import '../api/models/cart_models.dart';
import '../l10n/l10n.dart';
import 'cart_notifier.dart';

/// Totals from the server quote (never computed locally).
class CartTotals extends StatelessWidget {
  const CartTotals({super.key, required this.cart});

  final CartNotifier cart;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final q = cart.quote;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (cart.status == QuoteStatus.loading) ...[
              const LinearProgressIndicator(),
              const SizedBox(height: 4),
              Text(l.cartPricing, style: theme.textTheme.bodySmall),
              const SizedBox(height: 8),
            ],
            if (cart.status == QuoteStatus.error && cart.quoteError != null)
              _Notice(
                icon: Icons.error_outline,
                text: apiErrorMessage(l, cart.quoteError!),
                color: theme.colorScheme.error,
              ),
            if (q != null) ...[
              _Row(l.cartSubtotal, formatMoney(l, q.subtotalPiastres)),
              _Row(
                l.cartDeliveryFee,
                cart.service == ServiceType.delivery && cart.isProvisional
                    ? l.cartDeliveryFeePending
                    : formatMoney(l, q.deliveryFeePiastres),
              ),
              const Divider(),
              _Row(
                l.cartTotal,
                cart.isProvisional
                    ? formatMoney(l, q.subtotalPiastres)
                    : formatMoney(l, q.totalPiastres),
                bold: true,
              ),
              if (q.minOrderPiastres > 0 && !cart.isProvisional)
                Text(
                  l.cartMinimum(formatMoney(l, q.minOrderPiastres)),
                  style: theme.textTheme.bodySmall,
                ),
              if (q.etaMinutes != null && !cart.isProvisional)
                Text(
                  l.cartEta(q.etaMinutes!),
                  style: theme.textTheme.bodySmall,
                ),
              if (q.belowMinimum && !cart.isProvisional)
                _Notice(
                  key: const Key('below-min'),
                  icon: Icons.warning_amber_rounded,
                  text: l.cartBelowMinimum(formatMoney(l, q.minOrderPiastres)),
                  color: theme.colorScheme.error,
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.bold = false});
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyLarge;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Flexible(
            child: Text(value, style: style, textAlign: TextAlign.end),
          ),
        ],
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({
    super.key,
    required this.icon,
    required this.text,
    required this.color,
  });

  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: TextStyle(color: color)),
        ),
      ],
    ),
  );
}

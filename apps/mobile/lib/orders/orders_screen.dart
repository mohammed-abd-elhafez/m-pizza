import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/order_models.dart';
import '../auth/auth_notifier.dart';
import '../auth/login_screen.dart';
import '../cart/cart_notifier.dart';
import '../l10n/l10n.dart';
import '../menu/menu_notifier.dart';
import '../theme/common_widgets.dart';
import '../tracking/tracking_screen.dart';
import 'orders_notifier.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key, this.onReordered});

  /// Called after a successful reorder (the shell opens the cart tab).
  final VoidCallback? onReordered;

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  bool? _wasLoggedIn;

  Future<void> _reorder(OrderSummary order) async {
    final l = context.l10n;
    final menu = context.read<MenuNotifier>().menu;
    if (menu == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final result = await context.read<OrdersNotifier>().reorder(
      order,
      menu,
      context.read<CartNotifier>(),
    );
    if (!mounted) return;
    if (result.added == 0) {
      messenger.showSnackBar(SnackBar(content: Text(l.reorderNone)));
      return;
    }
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          result.dropped > 0
              ? '${l.reorderAdded(result.added)}. '
                    '${l.reorderDropped(result.dropped)}'
              : l.reorderAdded(result.added),
        ),
      ),
    );
    widget.onReordered?.call();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final auth = context.watch<AuthNotifier>();
    final orders = context.watch<OrdersNotifier>();
    if (_wasLoggedIn != auth.isLoggedIn) {
      _wasLoggedIn = auth.isLoggedIn;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final n = context.read<OrdersNotifier>();
        auth.isLoggedIn ? n.load() : n.reset();
      });
    }
    if (!auth.isLoggedIn) {
      return EmptyView(
        icon: Icons.receipt_long_outlined,
        title: l.ordersSignInPrompt,
        action: FilledButton(
          onPressed: () => Navigator.of(
            context,
          ).push(MaterialPageRoute<bool>(builder: (_) => const LoginScreen())),
          child: Text(l.accountSignIn),
        ),
      );
    }
    switch (orders.status) {
      case LoadStatus.idle:
      case LoadStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case LoadStatus.error:
        final err = orders.error!;
        if (err.isUnauthorized) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) auth.onUnauthorized();
          });
        }
        return ErrorView(
          message: err.isUnauthorized
              ? apiErrorMessage(l, err)
              : l.ordersLoadFailed,
          retryLabel: l.actionRetry,
          onRetry: orders.load,
        );
      case LoadStatus.ready:
        if (orders.orders.isEmpty) {
          return EmptyView(
            icon: Icons.receipt_long_outlined,
            title: l.ordersEmpty,
          );
        }
        return RefreshIndicator(
          onRefresh: orders.load,
          child: ContentWidth(
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                for (final o in orders.orders)
                  _OrderCard(order: o, onReorder: () => _reorder(o)),
              ],
            ),
          ),
        );
    }
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onReorder});

  final OrderSummary order;
  final VoidCallback onReorder;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    statusName(l, order.status),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                Text(
                  formatMoney(l, order.totalPiastres),
                  style: theme.textTheme.titleMedium,
                ),
              ],
            ),
            Text(formatDateTime(order.createdAt)),
            Text(l.ordersItemCount(order.lines.length)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          TrackingScreen(trackingToken: order.trackingToken),
                    ),
                  ),
                  child: Text(l.ordersTrack),
                ),
                FilledButton.icon(
                  onPressed: onReorder,
                  icon: const Icon(Icons.replay),
                  label: Text(l.ordersReorder),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

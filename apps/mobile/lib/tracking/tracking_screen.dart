import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../l10n/l10n.dart';
import '../theme/common_widgets.dart';
import 'status_timeline.dart';
import 'tracking_notifier.dart';

class TrackingScreen extends StatelessWidget {
  const TrackingScreen({super.key, required this.trackingToken});

  final String trackingToken;

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<TrackingNotifier>(
        create: (ctx) =>
            TrackingNotifier(ctx.read<ApiClient>(), trackingToken)..start(),
        child: const _TrackingView(),
      );
}

class _TrackingView extends StatelessWidget {
  const _TrackingView();

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final t = context.watch<TrackingNotifier>();
    final order = t.order;
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.trackTitle)),
      body: ContentWidth(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (order == null && t.error != null)
              ErrorView(
                message: apiErrorMessage(l, t.error!),
                retryLabel: l.actionRetry,
                onRetry: t.refresh,
              )
            else ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: StatusTimeline(status: t.status, service: t.service),
                ),
              ),
              _Connection(connection: t.connection),
              if (order != null) ...[
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l.trackPlacedAt(formatDateTime(order.createdAt)),
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(height: 8),
                        _kv(
                          l.cartSubtotal,
                          formatMoney(l, order.subtotalPiastres),
                        ),
                        _kv(
                          l.cartDeliveryFee,
                          formatMoney(l, order.deliveryFeePiastres),
                        ),
                        _kv(
                          l.cartTotal,
                          formatMoney(l, order.totalPiastres),
                          bold: true,
                        ),
                        if (paymentStatusName(l, t.paymentStatus) != null)
                          _kv(
                            l.trackPayment,
                            paymentStatusName(l, t.paymentStatus)!,
                          ),
                        if (order.branchPhone != null)
                          _kv(
                            l.trackBranchPhone,
                            order.branchPhone!,
                            ltr: true,
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
              child: Text(l.trackBackToMenu),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v, {bool bold = false, bool ltr = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              k,
              style: bold ? const TextStyle(fontWeight: FontWeight.bold) : null,
            ),
            Flexible(
              child: Text(
                v,
                textDirection: ltr ? TextDirection.ltr : null,
                style: bold
                    ? const TextStyle(fontWeight: FontWeight.bold)
                    : null,
              ),
            ),
          ],
        ),
      );
}

class _Connection extends StatelessWidget {
  const _Connection({required this.connection});
  final TrackingConnection connection;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (icon, text) = switch (connection) {
      TrackingConnection.connecting => (Icons.sync, l.trackConnecting),
      TrackingConnection.live => (Icons.wifi_tethering, l.trackLive),
      TrackingConnection.polling => (Icons.refresh, l.trackPolling),
      TrackingConnection.finished => (Icons.flag_outlined, l.trackFinished),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        key: Key('conn-${connection.name}'),
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

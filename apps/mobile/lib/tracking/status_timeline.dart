import 'package:flutter/material.dart';

import '../api/models/cart_models.dart';
import '../api/models/order_models.dart';
import '../l10n/l10n.dart';

/// Vertical status timeline. Done steps show a check, the current step is
/// highlighted, upcoming steps are muted.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({
    super.key,
    required this.status,
    required this.service,
  });

  final OrderStatus status;
  final ServiceType service;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final steps = OrderStatus.timeline(service);
    final current = steps.indexOf(status);
    final cancelled = status == OrderStatus.cancelled;
    return Column(
      key: const Key('timeline'),
      children: [
        if (cancelled)
          ListTile(
            key: const Key('cancelled'),
            leading: Icon(Icons.cancel, color: theme.colorScheme.error),
            title: Text(
              l.trackCancelledNotice,
              style: TextStyle(
                color: theme.colorScheme.error,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        for (var i = 0; i < steps.length; i++)
          _Step(
            label: statusName(l, steps[i]),
            state: cancelled
                ? _StepState.pending
                : i < current
                ? _StepState.done
                : i == current
                ? _StepState.current
                : _StepState.pending,
            isLast: i == steps.length - 1,
            stepKey: Key('step-${steps[i].wire}'),
          ),
      ],
    );
  }
}

enum _StepState { done, current, pending }

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.state,
    required this.isLast,
    required this.stepKey,
  });

  final String label;
  final _StepState state;
  final bool isLast;
  final Key stepKey;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.onSurface.withValues(alpha: 0.6);
    final icon = switch (state) {
      _StepState.done => Icons.check_circle,
      _StepState.current => Icons.radio_button_checked,
      _StepState.pending => Icons.radio_button_unchecked,
    };
    return Semantics(
      container: true,
      selected: state == _StepState.current,
      child: IntrinsicHeight(
        key: stepKey,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Column(
              children: [
                Icon(
                  icon,
                  color: state == _StepState.pending ? muted : primary,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: state == _StepState.done ? primary : muted,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Text(
                  label,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: state == _StepState.current
                        ? FontWeight.bold
                        : FontWeight.normal,
                    color: state == _StepState.pending ? muted : null,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

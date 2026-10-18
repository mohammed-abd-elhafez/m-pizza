import 'package:flutter/widgets.dart';

import '../api/api_exception.dart';
import '../api/models/order_models.dart';
import 'gen/app_localizations.dart';

export 'gen/app_localizations.dart';

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
  String get lang => Localizations.localeOf(this).languageCode;
}

/// Formats an amount of piastres as a localised price with Western digits:
/// whole pounds without decimals, otherwise two decimals.
String formatMoney(AppLocalizations l, int piastres) {
  final negative = piastres < 0;
  final abs = piastres.abs();
  final pounds = abs ~/ 100;
  final cents = abs % 100;
  final text = cents == 0
      ? '$pounds'
      : '$pounds.${cents.toString().padLeft(2, '0')}';
  return l.money(negative ? '-$text' : text);
}

String sizeName(AppLocalizations l, String label) => switch (label) {
  'S' => l.sizeLabelS,
  'M' => l.sizeLabelM,
  'L' => l.sizeLabelL,
  _ => l.sizeLabelRegular,
};

String statusName(AppLocalizations l, OrderStatus s) => switch (s) {
  OrderStatus.placed => l.statusPlaced,
  OrderStatus.accepted => l.statusAccepted,
  OrderStatus.preparing => l.statusPreparing,
  OrderStatus.ready => l.statusReady,
  OrderStatus.outForDelivery => l.statusOutForDelivery,
  OrderStatus.delivered => l.statusDelivered,
  OrderStatus.pickedUp => l.statusPickedUp,
  OrderStatus.cancelled => l.statusCancelled,
  OrderStatus.unknown => l.statusUnknown,
};

String? paymentStatusName(AppLocalizations l, String s) => switch (s) {
  'COD_PENDING' => l.payStatusCodPending,
  'COD_COLLECTED' => l.payStatusCodCollected,
  'UNPAID' => l.payStatusUnpaid,
  'PAID' => l.payStatusPaid,
  'REFUNDED' => l.payStatusRefunded,
  _ => null,
};

/// Date as `dd/MM/yyyy HH:mm` with Western digits regardless of locale.
String formatDateTime(DateTime t) {
  final d = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year} ${two(d.hour)}:${two(d.minute)}';
}

/// Maps every documented API error code to a friendly localised message.
String apiErrorMessage(AppLocalizations l, ApiException e) {
  switch (e.code) {
    case 'NETWORK':
      return l.errNetwork;
    case 'INVALID_REQUEST':
    case 'BAD_REQUEST':
      return l.errInvalidRequest;
    case 'UNAUTHORIZED':
      return l.errUnauthorized;
    case 'FORBIDDEN':
      return l.errForbidden;
    case 'NOT_FOUND':
      return l.errNotFound;
    case 'CONFLICT':
      return l.errConflict;
    case 'ILLEGAL_TRANSITION':
      return l.errIllegalTransition;
    case 'PAYMENT_PENDING':
      return l.errPaymentPending;
    case 'INVALID_CART':
      return l.errInvalidCart;
    case 'OUT_OF_ZONE':
      return l.errOutOfZone;
    case 'BELOW_MINIMUM':
      return l.errBelowMinimum;
    case 'BRANCH_UNAVAILABLE':
      return l.errBranchUnavailable;
    case 'RATE_LIMITED':
      final s = e.retryAfterSeconds;
      return s != null && s > 0 ? l.errRateLimitedWait(s) : l.errRateLimited;
    case 'INTERNAL':
      return l.errInternal;
    case 'BAD_RESPONSE':
      return l.errBadResponse;
  }
  if (e.status == 401) return l.errUnauthorized;
  if (e.status == 429) return l.errRateLimited;
  if (e.status >= 500) return l.errInternal;
  return l.errUnknown;
}

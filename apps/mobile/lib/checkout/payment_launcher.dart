import 'package:url_launcher/url_launcher.dart';

import '../core/config.dart';

/// Opens the hosted payment page.
abstract class PaymentLauncher {
  Future<bool> open(String url);
}

/// True only for https URLs on one of the allowed payment hosts, without embedded credentials.
bool isTrustedPaymentUrl(String url, {Iterable<String>? allowedHosts}) {
  final hosts = (allowedHosts ?? kPaymentHosts.split(','))
      .map((h) => h.trim().toLowerCase())
      .where((h) => h.isNotEmpty)
      .toSet();
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.isScheme('https') || uri.userInfo.isNotEmpty) {
    return false;
  }
  return hosts.contains(uri.host.toLowerCase());
}

class UrlPaymentLauncher implements PaymentLauncher {
  const UrlPaymentLauncher();

  @override
  Future<bool> open(String url) {
    if (!isTrustedPaymentUrl(url)) return Future.value(false);
    return launchUrl(Uri.parse(url), webOnlyWindowName: '_self');
  }
}
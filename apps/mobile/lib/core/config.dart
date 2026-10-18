/// Build-time configuration. No secrets live here.
///
/// `--dart-define=DEMO=true` builds a self-contained demo that talks to an in-memory fake server instead of the API
/// (used for the public GitHub Pages page). Never ship a release to customers with it.
const bool kDemoMode = bool.fromEnvironment('DEMO');
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:3000',
);

/// The API exposes branches only through pricing responses today, so pickup
/// uses this branch for the MVP.
const int kDefaultPickupBranchId = 1;

/// Debounce for live cart pricing.
const Duration kPriceDebounce = Duration(milliseconds: 400);

/// Polling interval used when the order WebSocket is unavailable.
const Duration kTrackingPollInterval = Duration(seconds: 10);

/// Online payment is not enabled on the server yet. Flip when it is; the
/// redirect code path in `CheckoutNotifier` is already wired.
const bool kOnlinePaymentEnabled = false;

/// Hosts the hosted payment page may be opened on (comma separated, build-time).
/// Anything else the server returns is refused, so a compromised response cannot send customers to a look-alike site.
const String kPaymentHosts = String.fromEnvironment(
  'PAYMENT_HOSTS',
  defaultValue: 'accept.paymob.com',
);

const Set<String> _kLocalDevelopmentHosts = {
  'localhost',
  '127.0.0.1',
  '10.0.2.2', // the Android emulator's alias for the host machine
  '::1',
};

/// Validates the API base URL at start-up. Release builds must use https; debug builds may also use plain http
/// to the local machine or the Android emulator host. Throws [StateError] otherwise.
Uri validateApiBaseUrl(String raw, {required bool release}) {
  final uri = Uri.tryParse(raw);
  if (uri == null ||
      !uri.hasScheme ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment) {
    throw StateError('API_BASE_URL is not a valid base URL');
  }
  if (uri.isScheme('https')) return uri;
  final localHttp =
      !release && uri.isScheme('http') && _kLocalDevelopmentHosts.contains(uri.host);
  if (!localHttp) {
    throw StateError(
      'API_BASE_URL must use https (plain http is only allowed for localhost in debug builds)',
    );
  }
  return uri;
}

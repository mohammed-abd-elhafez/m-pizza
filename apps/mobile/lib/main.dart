import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'api/api_client.dart';
import 'api/http_api_client.dart';
import 'app.dart';
import 'auth/session_store.dart';
import 'checkout/location.dart';
import 'core/config.dart';
import 'demo/demo_api_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(kDemoMode ? _demoApp() : _realApp());
}

/// Self-contained demo: in-memory fake server, session kept in memory only, clearly labelled.
Widget _demoApp() => MPizzaApp(
  api: DemoApiClient(),
  sessionStore: MemorySessionStore(),
  locationProvider: const GeolocatorLocationProvider(),
  showDemoBanner: true,
);

Widget _realApp() {
  // Refuse to start with an insecure or malformed API address (release builds require https).
  final base = validateApiBaseUrl(kApiBaseUrl, release: kReleaseMode);
  final ApiClient api = HttpApiClient(baseUrl: base.toString());
  return MPizzaApp(
    api: api,
    // Browsers have no secure storage; mobile uses the Keystore/Keychain.
    sessionStore: kIsWeb ? PrefsSessionStore() : SecureSessionStore(),
    locationProvider: const GeolocatorLocationProvider(),
  );
}
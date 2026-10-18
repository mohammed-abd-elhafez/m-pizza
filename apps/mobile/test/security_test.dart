import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/auth/session_store.dart';
import 'package:mpizza_app/checkout/payment_launcher.dart';
import 'package:mpizza_app/core/config.dart';

void main() {
  group('validateApiBaseUrl', () {
    test('release builds accept only https', () {
      expect(
        validateApiBaseUrl('https://api.mpizza.example', release: true).host,
        'api.mpizza.example',
      );
      for (final bad in [
        'http://api.mpizza.example',
        'http://127.0.0.1:3000',
        'ftp://api.mpizza.example',
        'api.mpizza.example',
        '',
      ]) {
        expect(
          () => validateApiBaseUrl(bad, release: true),
          throwsStateError,
          reason: bad,
        );
      }
    });

    test('debug builds also allow plain http, but only to the local machine or emulator host', () {
      for (final ok in [
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'http://10.0.2.2:3000',
      ]) {
        expect(validateApiBaseUrl(ok, release: false), isA<Uri>(), reason: ok);
      }
      expect(
        () => validateApiBaseUrl('http://192.168.1.50:3000', release: false),
        throwsStateError,
      );
      expect(
        () => validateApiBaseUrl('http://evil.example', release: false),
        throwsStateError,
      );
    });

    test('rejects credentials, queries and fragments in the base URL', () {
      for (final bad in [
        'https://user:pw@api.mpizza.example',
        'https://api.mpizza.example?x=1',
        'https://api.mpizza.example#frag',
      ]) {
        expect(
          () => validateApiBaseUrl(bad, release: true),
          throwsStateError,
          reason: bad,
        );
      }
    });
  });

  group('payment redirect allowlist', () {
    const hosts = ['accept.paymob.com'];

    test('accepts https on an allowed host only', () {
      expect(
        isTrustedPaymentUrl(
          'https://accept.paymob.com/api/acceptance/iframes/1?payment_token=x',
          allowedHosts: hosts,
        ),
        isTrue,
      );
      expect(
        isTrustedPaymentUrl('https://ACCEPT.paymob.com/x', allowedHosts: hosts),
        isTrue,
      );
    });

    test('rejects http, other hosts, look-alike hosts, credentials and odd schemes', () {
      for (final bad in [
        'http://accept.paymob.com/x',
        'https://evil.example/x',
        'https://accept.paymob.com.evil.example/x',
        'https://evil.example/accept.paymob.com',
        'https://accept.paymob.com@evil.example/x',
        'https://user:pw@accept.paymob.com/x',
        'javascript:alert(1)',
        'intent://x',
        'accept.paymob.com',
        '::::',
        '',
      ]) {
        expect(
          isTrustedPaymentUrl(bad, allowedHosts: hosts),
          isFalse,
          reason: bad,
        );
      }
    });

    test('the launcher refuses untrusted urls without trying to open them', () async {
      expect(
        await const UrlPaymentLauncher().open('https://evil.example/pay'),
        isFalse,
      );
      expect(
        await const UrlPaymentLauncher().open('http://accept.paymob.com/pay'),
        isFalse,
      );
    });
  });

  group('SecureSessionStore', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    final session = Session(
      token: 'tok-abcdef1234567890',
      expiresAt: DateTime.utc(2027, 1, 1),
      phone: '+201012345678',
    );

    test('round-trips a session and clears it', () async {
      final store = SecureSessionStore();
      expect(await store.load(), isNull);
      await store.save(session);
      final loaded = await store.load();
      expect(loaded?.token, session.token);
      expect(loaded?.phone, session.phone);
      expect(loaded?.expiresAt.toUtc(), session.expiresAt);
      await store.clear();
      expect(await store.load(), isNull);
    });

    test('treats corrupted stored data as no session instead of crashing', () async {
      FlutterSecureStorage.setMockInitialValues({'session': '{not json'});
      expect(await SecureSessionStore().load(), isNull);
      FlutterSecureStorage.setMockInitialValues({'session': '{"token":1}'});
      expect(await SecureSessionStore().load(), isNull);
    });

    test('the token is not left in plain shared preferences', () async {
      await SecureSessionStore().save(session);
      // The secure store never writes to the plain key-value store used by PrefsSessionStore.
      expect(await PrefsSessionStore().load(), isNull);
    });
  });
}

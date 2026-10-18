import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/models/order_models.dart';

/// Persists the customer session. Failures are swallowed: the app must work
/// (without persistence) when storage is unavailable.
abstract class SessionStore {
  Future<Session?> load();
  Future<void> save(Session session);
  Future<void> clear();
}

class PrefsSessionStore implements SessionStore {
  static const _kToken = 'session.token';
  static const _kExpires = 'session.expiresAt';
  static const _kPhone = 'session.phone';

  @override
  Future<Session?> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final token = p.getString(_kToken);
      final expires = p.getString(_kExpires);
      final phone = p.getString(_kPhone);
      if (token == null || expires == null || phone == null) return null;
      return Session(
        token: token,
        expiresAt: DateTime.parse(expires),
        phone: phone,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(Session session) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_kToken, session.token);
      await p.setString(_kExpires, session.expiresAt.toIso8601String());
      await p.setString(_kPhone, session.phone);
    } catch (_) {
      // Storage unavailable: keep the session in memory only.
    }
  }

  @override
  Future<void> clear() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.remove(_kToken);
      await p.remove(_kExpires);
      await p.remove(_kPhone);
    } catch (_) {
      // Nothing to clear.
    }
  }
}

/// Stores the session in the platform's encrypted storage (Android Keystore-backed, iOS Keychain), so the bearer
/// token is not readable from backups or from a plain preferences file. Used on mobile; web falls back to
/// [PrefsSessionStore] because browsers have no secure storage.
class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _kSession = 'session';
  final FlutterSecureStorage _storage;

  @override
  Future<Session?> load() async {
    try {
      final raw = await _storage.read(key: _kSession);
      if (raw == null) return null;
      final map = jsonDecode(raw);
      if (map is! Map) return null;
      final token = map['token'];
      final expires = map['expiresAt'];
      final phone = map['phone'];
      if (token is! String || expires is! String || phone is! String) {
        return null;
      }
      return Session(
        token: token,
        expiresAt: DateTime.parse(expires),
        phone: phone,
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(Session session) async {
    try {
      await _storage.write(
        key: _kSession,
        value: jsonEncode({
          'token': session.token,
          'expiresAt': session.expiresAt.toIso8601String(),
          'phone': session.phone,
        }),
      );
    } catch (_) {
      // Storage unavailable: keep the session in memory only.
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _kSession);
    } catch (_) {
      // Nothing to clear.
    }
  }
}

/// In-memory store for tests and previews.
class MemorySessionStore implements SessionStore {
  Session? value;

  @override
  Future<Session?> load() async => value;

  @override
  Future<void> save(Session session) async => value = session;

  @override
  Future<void> clear() async => value = null;
}

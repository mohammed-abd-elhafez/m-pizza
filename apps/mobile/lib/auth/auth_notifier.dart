import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/order_models.dart';
import 'phone.dart';
import 'session_store.dart';

enum LoginStep { phone, code }

class AuthNotifier extends ChangeNotifier {
  AuthNotifier(this._api, this._store, {DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final ApiClient _api;
  final SessionStore _store;
  final DateTime Function() _clock;

  Session? _session;
  LoginStep _step = LoginStep.phone;
  String? _pendingPhone;
  bool _busy = false;
  ApiException? _error;
  bool _invalidCode = false;

  Session? get session => _session;
  bool get isLoggedIn => _session != null;
  String? get phone => _session?.phone;
  LoginStep get step => _step;
  String? get pendingPhone => _pendingPhone;
  bool get busy => _busy;
  ApiException? get error => _error;
  bool get invalidCode => _invalidCode;

  /// Restores a saved, unexpired session.
  Future<void> restore() async {
    final saved = await _store.load();
    if (saved == null) return;
    if (saved.isExpired(_clock())) {
      await _store.clear();
      return;
    }
    _session = saved;
    _api.authToken = saved.token;
    notifyListeners();
  }

  /// Sends a code. Returns false when [rawPhone] is invalid or the call fails.
  Future<bool> requestCode(String rawPhone) async {
    final phone = normalizeEgyptPhone(rawPhone);
    if (phone == null) return false;
    return _run(() async {
      await _api.requestOtp(phone);
      _pendingPhone = phone;
      _step = LoginStep.code;
    });
  }

  Future<bool> verify(String rawCode) async {
    final code = normalizeOtpCode(rawCode);
    final phone = _pendingPhone;
    if (code == null || phone == null) return false;
    _invalidCode = false;
    final ok = await _run(() async {
      final s = await _api.verifyOtp(phone, code);
      _session = s;
      _api.authToken = s.token;
      await _store.save(s);
      _step = LoginStep.phone;
      _pendingPhone = null;
    });
    if (!ok && (_error?.isUnauthorized ?? false)) {
      _invalidCode = true;
    }
    return ok;
  }

  void changeNumber() {
    _step = LoginStep.phone;
    _error = null;
    _invalidCode = false;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await _api.logout();
    } on ApiException {
      // The token may already be invalid; sign out locally regardless.
    }
    await _clearLocal();
  }

  /// Called when any authenticated call returns 401.
  Future<void> onUnauthorized() => _clearLocal();

  Future<void> _clearLocal() async {
    _session = null;
    _api.authToken = null;
    await _store.clear();
    notifyListeners();
  }

  Future<bool> _run(Future<void> Function() action) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await action();
      return true;
    } on ApiException catch (e) {
      _error = e;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}

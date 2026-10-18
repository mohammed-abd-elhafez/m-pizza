import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Holds the UI locale. Arabic by default.
class LocaleNotifier extends ChangeNotifier {
  LocaleNotifier({Locale? initial}) : _locale = initial ?? const Locale('ar');

  static const _key = 'locale';
  Locale _locale;

  Locale get locale => _locale;
  bool get isArabic => _locale.languageCode == 'ar';

  Future<void> restore() async {
    try {
      final p = await SharedPreferences.getInstance();
      final code = p.getString(_key);
      if (code == 'ar' || code == 'en') {
        _locale = Locale(code!);
        notifyListeners();
      }
    } catch (_) {
      // Keep the default locale.
    }
  }

  Future<void> setLanguage(String code) async {
    if (code != 'ar' && code != 'en') return;
    _locale = Locale(code);
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key, code);
    } catch (_) {
      // Preference is best effort.
    }
  }

  Future<void> toggle() => setLanguage(isArabic ? 'en' : 'ar');
}

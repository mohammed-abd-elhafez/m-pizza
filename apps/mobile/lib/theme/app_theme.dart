import 'package:flutter/material.dart';

/// Warm pizza-red / cream theme. Text colours keep WCAG AA contrast.
class AppTheme {
  static const Color red = Color(0xFFB71C1C);
  static const Color cream = Color(0xFFFFF6E8);
  static const Color ink = Color(0xFF2B1B17);

  static ThemeData light() {
    final scheme =
        ColorScheme.fromSeed(
          seedColor: red,
          brightness: Brightness.light,
        ).copyWith(
          primary: red,
          onPrimary: Colors.white,
          surface: cream,
          onSurface: ink,
          error: const Color(0xFF8E0000),
        );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: cream,
      appBarTheme: const AppBarTheme(
        backgroundColor: red,
        foregroundColor: Colors.white,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 1,
        margin: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Colors.white,
      ),
    );
  }
}

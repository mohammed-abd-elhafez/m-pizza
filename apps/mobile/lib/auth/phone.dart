/// Converts Arabic-Indic and Eastern Arabic-Indic digits to Western digits.
String toWesternDigits(String input) {
  final b = StringBuffer();
  for (final r in input.runes) {
    if (r >= 0x0660 && r <= 0x0669) {
      b.writeCharCode(0x30 + r - 0x0660);
    } else if (r >= 0x06F0 && r <= 0x06F9) {
      b.writeCharCode(0x30 + r - 0x06F0);
    } else {
      b.writeCharCode(r);
    }
  }
  return b.toString();
}

/// Normalises Egyptian mobile numbers to `+201XXXXXXXXX`.
///
/// Accepts `01012345678`, `+201012345678`, `201012345678`, `00201012345678`,
/// spaces/dashes and Arabic digits. Returns null when invalid.
String? normalizeEgyptPhone(String input) {
  var s = toWesternDigits(input).replaceAll(RegExp(r'[\s\-().]'), '');
  if (s.startsWith('+')) {
    s = s.substring(1);
  } else if (s.startsWith('00')) {
    s = s.substring(2);
  }
  if (!RegExp(r'^\d+$').hasMatch(s)) return null;
  String local;
  if (s.startsWith('20') && s.length == 12) {
    local = '0${s.substring(2)}';
  } else if (s.startsWith('0') && s.length == 11) {
    local = s;
  } else {
    return null;
  }
  if (!RegExp(r'^01[0125]\d{8}$').hasMatch(local)) return null;
  return '+20${local.substring(1)}';
}

/// Returns the 6-digit code with Western digits, or null when invalid.
String? normalizeOtpCode(String input) {
  final s = toWesternDigits(input).replaceAll(RegExp(r'\s'), '');
  return RegExp(r'^\d{6}$').hasMatch(s) ? s : null;
}

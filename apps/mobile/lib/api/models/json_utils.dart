/// Small helpers for defensive JSON parsing. Malformed data throws
/// [FormatException], which the API client converts to an error.
Map<String, dynamic> asMap(Object? v, [String what = 'object']) {
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return Map<String, dynamic>.from(v);
  throw FormatException('Expected $what');
}

List<dynamic> asList(Object? v, [String what = 'array']) {
  if (v is List) return v;
  throw FormatException('Expected $what');
}

int asInt(Object? v, [String what = 'integer']) {
  if (v is int) return v;
  if (v is num && v == v.roundToDouble()) return v.toInt();
  throw FormatException('Expected $what');
}

String asString(Object? v, [String what = 'string']) {
  if (v is String) return v;
  throw FormatException('Expected $what');
}

String? optString(Object? v) => v is String && v.isNotEmpty ? v : null;

String pickLang(String lang, String ar, String en) {
  if (lang == 'ar') return ar.isNotEmpty ? ar : en;
  return en.isNotEmpty ? en : ar;
}

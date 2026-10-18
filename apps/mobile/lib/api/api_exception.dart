/// An error returned by the API (or a transport failure, code `NETWORK`).
class ApiException implements Exception {
  const ApiException({
    required this.status,
    required this.code,
    this.message = '',
    this.fields = const [],
    this.retryAfterSeconds,
  });

  /// HTTP status, or 0 when no response was received.
  final int status;
  final String code;
  final String message;
  final List<String> fields;
  final int? retryAfterSeconds;

  bool get isUnauthorized => status == 401 || code == 'UNAUTHORIZED';

  @override
  String toString() => 'ApiException($status, $code)';
}

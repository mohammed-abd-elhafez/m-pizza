import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/auth/phone.dart';
import 'package:mpizza_app/core/uuid.dart';

void main() {
  group('normalizeEgyptPhone', () {
    test('accepts the documented formats', () {
      for (final input in [
        '01012345678',
        '+201012345678',
        '201012345678',
        '00201012345678',
        '010 1234 5678',
        '010-1234-5678',
        '٠١٠١٢٣٤٥٦٧٨',
        '+٢٠١٠١٢٣٤٥٦٧٨',
      ]) {
        expect(normalizeEgyptPhone(input), '+201012345678', reason: input);
      }
    });

    test('accepts all mobile prefixes', () {
      expect(normalizeEgyptPhone('01112345678'), '+201112345678');
      expect(normalizeEgyptPhone('01212345678'), '+201212345678');
      expect(normalizeEgyptPhone('01512345678'), '+201512345678');
    });

    test('rejects invalid numbers', () {
      for (final input in [
        '',
        '0101234567',
        '010123456789',
        '01312345678',
        '02112345678',
        'abc',
        '+441012345678',
        '1012345678',
      ]) {
        expect(normalizeEgyptPhone(input), isNull, reason: input);
      }
    });
  });

  group('normalizeOtpCode', () {
    test('accepts six digits (also Arabic)', () {
      expect(normalizeOtpCode('123456'), '123456');
      expect(normalizeOtpCode('١٢٣٤٥٦'), '123456');
      expect(normalizeOtpCode(' 123 456 '), '123456');
    });
    test('rejects others', () {
      expect(normalizeOtpCode('12345'), isNull);
      expect(normalizeOtpCode('1234567'), isNull);
      expect(normalizeOtpCode('12a456'), isNull);
    });
  });

  test('toWesternDigits converts both Arabic digit blocks', () {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
    expect(toWesternDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  });

  test('generateUuidV4 is a v4 UUID and valid as an idempotency key', () {
    final id = generateUuidV4(Random(1));
    expect(
      RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-'
        r'[0-9a-f]{12}$',
      ).hasMatch(id),
      isTrue,
    );
    expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(id), isTrue);
    expect(generateUuidV4(), isNot(generateUuidV4()));
  });
}

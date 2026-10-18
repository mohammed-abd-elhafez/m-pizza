import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/auth/session_store.dart';

import 'support/fakes.dart';

MemorySessionStore signedIn() => MemorySessionStore()
  ..value = Session(
    token: 'tok',
    expiresAt: DateTime.now().add(const Duration(days: 20)),
    phone: '+201012345678',
  );

Future<void> addMarg(WidgetTester tester) async {
  await tester.tap(find.text('مارجريتا'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('submit')));
  await tester.pumpAndSettle();
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  await tester.dragUntilVisible(
    f,
    find
        .descendant(
          of: find.byType(Scaffold).last,
          matching: find.byType(Scrollable),
        )
        .first,
    const Offset(0, -200),
  );
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> openCart(WidgetTester tester) async {
  await tester.tap(find.text('السلة'));
  await tester.pumpAndSettle();
}

void main() {
  group('login', () {
    testWidgets('phone then OTP signs the user in (RTL, Arabic digits)', (
      tester,
    ) async {
      final api = FakeApiClient();
      await pumpApp(tester, api: api);
      expect(
        Directionality.of(tester.element(find.byType(Scaffold).first)),
        TextDirection.rtl,
      );
      await tester.tap(find.byKey(const Key('sign-in')));
      await tester.pumpAndSettle();
      expect(find.text('سجّل الدخول لإتمام الطلب'), findsOneWidget);

      await tester.tap(find.text('إرسال الكود'));
      await tester.pumpAndSettle();
      expect(find.textContaining('أدخل رقم موبايل مصري صحيح'), findsOneWidget);
      expect(api.otpRequests, isEmpty);

      await tester.enterText(find.byType(TextFormField), '٠١٠١٢٣٤٥٦٧٨');
      await tester.tap(find.text('إرسال الكود'));
      await tester.pumpAndSettle();
      expect(api.otpRequests.single, '+201012345678');
      expect(find.text('الكود المكوّن من 6 أرقام'), findsOneWidget);

      await tester.tap(find.text('تأكيد ومتابعة'));
      await tester.pumpAndSettle();
      expect(find.text('أدخل الكود المكوّن من 6 أرقام'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField), '123456');
      await tester.tap(find.text('تأكيد ومتابعة'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('account-menu')), findsOneWidget);
      expect(api.authToken, 'session-token');
    });

    testWidgets('wrong code shows a friendly message', (tester) async {
      final api = FakeApiClient()
        ..onVerify = (p, c) async => throw apiError('UNAUTHORIZED', 401);
      await pumpApp(tester, api: api, language: 'en');
      await tester.tap(find.byKey(const Key('sign-in')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '01012345678');
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '654321');
      await tester.tap(find.text('Verify and continue'));
      await tester.pumpAndSettle();
      expect(find.textContaining('wrong or has expired'), findsOneWidget);
      await tester.tap(find.text('Use a different number'));
      await tester.pumpAndSettle();
      expect(find.text('Mobile number'), findsOneWidget);
    });

    testWidgets('sign out from the account menu', (tester) async {
      final api = FakeApiClient();
      await pumpApp(tester, api: api, store: signedIn());
      await tester.tap(find.byKey(const Key('account-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();
      expect(api.logoutCalls, 1);
      expect(find.byKey(const Key('sign-in')), findsOneWidget);
    });
  });

  group('menu -> customiser -> cart', () {
    testWidgets('browse without login, build a half-and-half pizza', (
      tester,
    ) async {
      final api = FakeApiClient();
      await pumpApp(tester, api: api);
      expect(find.text('مارجريتا'), findsOneWidget);
      expect(find.text('يبدأ من 80 ج.م'), findsOneWidget);
      // Unavailable item is shown but disabled.
      expect(find.text('غير متاح'), findsOneWidget);

      await tester.tap(find.text('مشروبات'));
      await tester.pumpAndSettle();
      expect(find.text('كولا'), findsOneWidget);
      await tester.tap(find.text('بيتزا'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('مارجريتا'));
      await tester.pumpAndSettle();
      expect(find.text('السعر التقريبي: 100 ج.م'), findsOneWidget);

      await tapKey(tester, 'half-switch');
      expect(find.textContaining('السعر = سعر النصف الأعلى'), findsOneWidget);
      expect(find.text('النصف الأيسر'), findsOneWidget);
      expect(find.text('النصف الأيمن'), findsOneWidget);

      await tapKey(tester, 'right-pizza');
      await tester.tap(find.text('بيبروني').last);
      await tester.pumpAndSettle();
      // higher half (pepperoni M 120) is the price
      expect(find.text('السعر التقريبي: 120 ج.م'), findsOneWidget);

      await tapKey(tester, 'left-add-1');
      expect(find.text('السعر التقريبي: 135 ج.م'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();
      expect(find.text('السعر التقريبي: 270 ج.م'), findsOneWidget);

      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      expect(find.text('تمت الإضافة إلى السلة'), findsOneWidget);

      await openCart(tester);
      expect(find.textContaining('نصف مارجريتا / نصف بيبروني'), findsOneWidget);
      expect(find.textContaining('إضافات: مشروم'), findsOneWidget);
      // server totals are shown, delivery fee waits for a location
      expect(find.text('تُحدد حسب موقعك'), findsOneWidget);
      final sent = api.priceRequests.last.toJson();
      expect(sent['lines'], hasLength(1));
      expect(((sent['lines'] as List).first as Map)['halves'], hasLength(2));
      expect(((sent['lines'] as List).first as Map)['qty'], 2);
    });

    testWidgets('edit and remove cart lines, empty state', (tester) async {
      final api = FakeApiClient();
      await pumpApp(tester, api: api);
      await addMarg(tester);
      await openCart(tester);
      await tester.tap(find.byKey(const Key('edit-0')));
      await tester.pumpAndSettle();
      expect(find.text('تحديث الصنف'), findsOneWidget);
      await tapKey(tester, 'crust-2');
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      expect(find.textContaining('العجينة: محشية جبنة'), findsOneWidget);

      await tester.tap(find.byKey(const Key('remove-0')));
      await tester.pumpAndSettle();
      expect(find.text('سلتك فارغة'), findsOneWidget);
      await tester.tap(find.text('تصفّح القائمة'));
      await tester.pumpAndSettle();
      expect(find.text('مارجريتا'), findsOneWidget);
    });

    testWidgets('shows the minimum-order warning and blocks checkout', (
      tester,
    ) async {
      final api = FakeApiClient()
        ..onPrice = (r) async =>
            sampleQuote(subtotal: 3000, min: 5000, lines: r.lines.length);
      await pumpApp(tester, api: api);
      await addMarg(tester);
      await openCart(tester);
      await tester.tap(find.text('استلام من المطعم'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('below-min')), findsOneWidget);
      expect(find.textContaining('50 ج.م'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('checkout')))
            .onPressed,
        isNull,
      );
    });

    testWidgets('menu error and empty states', (tester) async {
      final api = FakeApiClient()
        ..onMenu = () async => throw apiError('NETWORK', 0);
      await pumpApp(tester, api: api);
      expect(find.text('تعذّر تحميل القائمة.'), findsOneWidget);
      api.onMenu = () async => sampleMenu();
      await tester.tap(find.text('حاول مرة أخرى'));
      await tester.pumpAndSettle();
      expect(find.text('مارجريتا'), findsOneWidget);
    });

    testWidgets('language toggle switches to English, LTR and EGP', (
      tester,
    ) async {
      final api = FakeApiClient();
      await pumpApp(tester, api: api);
      await tester.tap(find.byKey(const Key('lang-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Margherita'), findsOneWidget);
      expect(find.text('From EGP 80'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(Scaffold).first)),
        TextDirection.ltr,
      );
    });
  });
}

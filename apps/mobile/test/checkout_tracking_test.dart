import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/auth/session_store.dart';
import 'package:mpizza_app/l10n/gen/app_localizations.dart';
import 'package:mpizza_app/tracking/status_timeline.dart';

import 'support/fakes.dart';

MemorySessionStore signedIn() => MemorySessionStore()
  ..value = Session(
    token: 'tok',
    expiresAt: DateTime.now().add(const Duration(days: 20)),
    phone: '+201012345678',
  );

/// Adds a margherita, opens the cart on pickup and goes to checkout.
Future<void> toPickupCheckout(WidgetTester tester) async {
  await tester.tap(find.text('مارجريتا'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('السلة'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('استلام من المطعم'));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('checkout')));
  await tester.pumpAndSettle();
}

void main() {
  group('checkout error mapping (Arabic)', () {
    final cases = <String, (int, String)>{
      'OUT_OF_ZONE': (422, 'عذرًا، لا نوصّل إلى هذا الموقع حاليًا'),
      'BELOW_MINIMUM': (422, 'طلبك أقل من الحد الأدنى لمنطقتك'),
      'INVALID_CART': (422, 'يوجد صنف في سلتك لم يعد متاحًا'),
      'RATE_LIMITED': (429, 'محاولات كثيرة'),
      'CONFLICT': (409, 'تم إرسال هذا الطلب سابقًا ببيانات مختلفة'),
      'BRANCH_UNAVAILABLE': (422, 'المطعم لا يستقبل طلبات حاليًا'),
      'INTERNAL': (500, 'حدث خطأ من جانبنا'),
      'NETWORK': (0, 'تعذّر الاتصال بالخادم'),
    };
    for (final entry in cases.entries) {
      testWidgets(entry.key, (tester) async {
        final api = FakeApiClient()
          ..onPlaceOrder = (c, m, k) async =>
              throw apiError(entry.key, entry.value.$1);
        await pumpApp(tester, api: api, store: signedIn());
        await toPickupCheckout(tester);
        expect(find.text('إتمام الطلب'), findsWidgets);
        await tester.tap(find.byKey(const Key('place-order')));
        await tester.pumpAndSettle();
        expect(
          find.descendant(
            of: find.byKey(const Key('checkout-error')),
            matching: find.textContaining(entry.value.$2),
          ),
          findsOneWidget,
        );
        // Still on the checkout page and the user can retry.
        expect(find.byKey(const Key('place-order')), findsOneWidget);
      });
    }

    testWidgets('401 returns the user to login', (tester) async {
      final api = FakeApiClient()
        ..onPlaceOrder = (c, m, k) async => throw apiError('UNAUTHORIZED', 401);
      await pumpApp(tester, api: api, store: signedIn());
      await toPickupCheckout(tester);
      await tester.tap(find.byKey(const Key('place-order')));
      await tester.pumpAndSettle();
      expect(find.text('سجّل الدخول لإتمام الطلب'), findsOneWidget);
      expect(api.authToken, isNull);
    });

    testWidgets('retry reuses the same Idempotency-Key', (tester) async {
      final api = FakeApiClient()
        ..onPlaceOrder = (c, m, k) async => throw apiError('INTERNAL', 500);
      await pumpApp(tester, api: api, store: signedIn());
      await toPickupCheckout(tester);
      await tester.tap(find.byKey(const Key('place-order')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('place-order')));
      await tester.pumpAndSettle();
      expect(api.placedKeys, hasLength(2));
      expect(api.placedKeys[0], api.placedKeys[1]);
    });

    testWidgets('online payment is shown disabled with an explanation', (
      tester,
    ) async {
      await pumpApp(tester, api: FakeApiClient(), store: signedIn());
      await toPickupCheckout(tester);
      expect(
        find.textContaining('الدفع أونلاين غير متاح حاليًا'),
        findsOneWidget,
      );
      expect(find.text('الدفع عند الاستلام'), findsOneWidget);
    });
  });

  group('delivery checkout', () {
    testWidgets('validates landmark, places the order, opens tracking', (
      tester,
    ) async {
      final stream = StreamController<StatusEvent>();
      final api = FakeApiClient()..onStream = (_) => stream.stream;
      await pumpApp(tester, api: api, store: signedIn());
      await tester.tap(find.text('مارجريتا'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('السلة'));
      await tester.pumpAndSettle();

      // No location yet: the checkout button first asks for one.
      await tester.tap(find.byKey(const Key('checkout')));
      await tester.pumpAndSettle();
      expect(find.text('موقع التوصيل'), findsOneWidget);
      await tester.tap(find.byKey(const Key('preset-downtownCairo')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-location')));
      await tester.pumpAndSettle();
      expect(find.textContaining('التوصيل إلى 30.0444'), findsOneWidget);
      expect(api.priceRequests.last.service, ServiceType.delivery);

      await tester.tap(find.byKey(const Key('checkout')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('place-order')));
      await tester.pumpAndSettle();
      expect(find.text('العلامة المميزة مطلوبة'), findsOneWidget);
      expect(api.placedKeys, isEmpty);

      await tester.enterText(find.byKey(const Key('landmark')), 'بجوار المسجد');
      await tester.tap(find.byKey(const Key('place-order')));
      await tester.pumpAndSettle();
      expect(api.placedKeys, hasLength(1));
      expect(api.placedAddresses.single!.landmark, 'بجوار المسجد');
      expect(find.text('تتبّع طلبك'), findsOneWidget);
      expect(find.byKey(const Key('timeline')), findsOneWidget);

      stream.add(
        const StatusEvent(
          status: OrderStatus.preparing,
          paymentStatus: 'COD_PENDING',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conn-live')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      unawaited(stream.close());
    });
  });

  group('tracking timeline', () {
    Future<void> pumpTimeline(
      WidgetTester tester, {
      required String lang,
      required OrderStatus status,
      ServiceType service = ServiceType.delivery,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          home: Scaffold(
            body: StatusTimeline(status: status, service: service),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('renders RTL in Arabic: icon column is on the right', (
      tester,
    ) async {
      await pumpTimeline(tester, lang: 'ar', status: OrderStatus.preparing);
      expect(
        Directionality.of(tester.element(find.byKey(const Key('timeline')))),
        TextDirection.rtl,
      );
      final icon = tester.getCenter(find.byIcon(Icons.check_circle).first);
      final label = tester.getCenter(find.text('تم استلام الطلب'));
      expect(icon.dx, greaterThan(label.dx));
      expect(find.text('جارٍ التحضير'), findsOneWidget);
      expect(find.text('تم التوصيل'), findsOneWidget);
      expect(find.text('تم الاستلام'), findsNothing);
      // placed + accepted are done, preparing is current
      expect(find.byIcon(Icons.check_circle), findsNWidgets(2));
      expect(find.byIcon(Icons.radio_button_checked), findsOneWidget);
    });

    testWidgets('English is LTR with icon on the left', (tester) async {
      await pumpTimeline(tester, lang: 'en', status: OrderStatus.placed);
      final icon = tester.getCenter(find.byIcon(Icons.radio_button_checked));
      final label = tester.getCenter(find.text('Order placed'));
      expect(icon.dx, lessThan(label.dx));
    });

    testWidgets('pickup timeline ends with picked up', (tester) async {
      await pumpTimeline(
        tester,
        lang: 'en',
        status: OrderStatus.ready,
        service: ServiceType.pickup,
      );
      expect(find.text('Picked up'), findsOneWidget);
      expect(find.text('Out for delivery'), findsNothing);
    });

    testWidgets('cancelled order shows a notice and no progress', (
      tester,
    ) async {
      await pumpTimeline(tester, lang: 'ar', status: OrderStatus.cancelled);
      expect(find.byKey(const Key('cancelled')), findsOneWidget);
      expect(find.text('تم إلغاء هذا الطلب.'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsNothing);
    });

    testWidgets('delivered marks every step done', (tester) async {
      await pumpTimeline(tester, lang: 'en', status: OrderStatus.delivered);
      expect(find.byIcon(Icons.check_circle), findsNWidgets(5));
    });
  });
}

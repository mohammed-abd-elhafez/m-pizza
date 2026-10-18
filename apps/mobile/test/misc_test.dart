import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/api_client.dart';
import 'package:mpizza_app/api/api_exception.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/auth/session_store.dart';
import 'package:mpizza_app/checkout/location.dart';
import 'package:mpizza_app/l10n/l10n.dart';
import 'package:mpizza_app/l10n/locale_notifier.dart';
import 'package:mpizza_app/tracking/tracking_screen.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

Session _session() => Session(
  token: 'tok',
  expiresAt: DateTime.now().add(const Duration(days: 20)),
  phone: '+201012345678',
);

MemorySessionStore _signedIn() => MemorySessionStore()..value = _session();

CartLine _goneLine() => CartLine(
  qty: 1,
  halves: const [PizzaHalf(side: HalfSide.whole, itemId: 404, sizeId: 1)],
);

Future<void> pumpTracking(
  WidgetTester tester,
  FakeApiClient api, {
  String lang = 'ar',
}) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    Provider<ApiClient>.value(
      value: api,
      child: MaterialApp(
        locale: Locale(lang),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: const TrackingScreen(trackingToken: 'tok-1234567890abcdef'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('tracking screen', () {
    testWidgets('shows details, branch phone and live updates', (tester) async {
      final stream = StreamController<StatusEvent>();
      final api = FakeApiClient()
        ..onTrack = ((_) async => sampleTracked(status: OrderStatus.accepted))
        ..onStream = (_) => stream.stream;
      await pumpTracking(tester, api);
      expect(find.text('تتبّع طلبك'), findsOneWidget);
      expect(find.text('+20221234567'), findsOneWidget);
      expect(find.text('115 ج.م'), findsOneWidget);
      expect(find.text('الدفع عند الاستلام'), findsOneWidget);
      expect(find.byKey(const Key('conn-connecting')), findsOneWidget);

      stream.add(
        const StatusEvent(
          status: OrderStatus.outForDelivery,
          paymentStatus: 'COD_PENDING',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conn-live')), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsNWidgets(4));

      stream.add(
        const StatusEvent(
          status: OrderStatus.delivered,
          paymentStatus: 'COD_COLLECTED',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('conn-finished')), findsOneWidget);
      expect(find.text('تم تحصيل المبلغ'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      unawaited(stream.close());
    });

    testWidgets('falls back to 10 s polling when the socket fails', (
      tester,
    ) async {
      var polls = 0;
      final api = FakeApiClient()
        ..onTrack = (_) async {
          polls++;
          return sampleTracked(
            status: polls >= 2 ? OrderStatus.ready : OrderStatus.placed,
          );
        }
        ..onStream = (_) => Stream<StatusEvent>.error(StateError('ws down'));
      await pumpTracking(tester, api, lang: 'en');
      expect(find.byKey(const Key('conn-polling')), findsOneWidget);
      expect(
        find.text('Checking for updates every 10 seconds'),
        findsOneWidget,
      );
      expect(polls, 1);
      await tester.pump(const Duration(seconds: 9));
      expect(polls, 1);
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(polls, 2);
      expect(find.text('Ready'), findsWidgets);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('shows an error with retry when the order cannot load', (
      tester,
    ) async {
      final api = FakeApiClient()
        ..onTrack = (_) async => throw apiError('NOT_FOUND', 404);
      await pumpTracking(tester, api);
      expect(find.text('لم نعثر على المطلوب.'), findsOneWidget);
      api.onTrack = (_) async => sampleTracked();
      await tester.tap(find.text('حاول مرة أخرى'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('timeline')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('orders and reorder', () {
    testWidgets('signed out users are asked to sign in', (tester) async {
      await pumpApp(tester, api: FakeApiClient());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      expect(find.text('سجّل الدخول لعرض طلباتك.'), findsOneWidget);
    });

    testWidgets('one-tap reorder re-prices and drops unavailable items', (
      tester,
    ) async {
      final api = FakeApiClient()
        ..onListOrders = () async => [
          sampleOrder(lines: [marg(qty: 2), _goneLine()]),
        ];
      await pumpApp(tester, api: api, store: _signedIn());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      expect(find.text('تم التوصيل'), findsOneWidget);
      expect(find.text('115 ج.م'), findsOneWidget);
      await tester.tap(find.text('اطلب مرة أخرى'));
      await tester.pumpAndSettle();
      // moved to the cart tab with the available line re-priced by the server
      expect(find.byKey(const Key('line-0')), findsOneWidget);
      expect(find.byKey(const Key('line-1')), findsNothing);
      expect(api.priceRequests, isNotEmpty);
      expect(find.textContaining('لم يعد متاحًا وتم استبعاده'), findsOneWidget);
    });

    testWidgets('reorder with nothing available says so', (tester) async {
      final api = FakeApiClient()
        ..onListOrders = () async => [
          sampleOrder(lines: [_goneLine()]),
        ];
      await pumpApp(tester, api: api, store: _signedIn());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('اطلب مرة أخرى'));
      await tester.pumpAndSettle();
      expect(
        find.text('لا يوجد أي صنف من هذا الطلب متاح حاليًا.'),
        findsOneWidget,
      );
    });

    testWidgets('empty list state', (tester) async {
      final api = FakeApiClient()..onListOrders = () async => [];
      await pumpApp(tester, api: api, store: _signedIn());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      expect(find.text('لم تقم بأي طلب بعد.'), findsOneWidget);
    });

    testWidgets('error then retry then track', (tester) async {
      var fail = true;
      final api = FakeApiClient()
        ..onListOrders = () async {
          if (fail) throw apiError('NETWORK', 0);
          return [sampleOrder()];
        };
      await pumpApp(tester, api: api, store: _signedIn());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      expect(find.text('تعذّر تحميل طلباتك.'), findsOneWidget);
      fail = false;
      await tester.tap(find.text('حاول مرة أخرى'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('تتبّع'));
      await tester.pumpAndSettle();
      expect(find.text('تتبّع طلبك'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('401 while loading orders signs the user out', (tester) async {
      final api = FakeApiClient()
        ..onListOrders = () async => throw apiError('UNAUTHORIZED', 401);
      await pumpApp(tester, api: api, store: _signedIn());
      await tester.tap(find.text('طلباتي'));
      await tester.pumpAndSettle();
      expect(find.text('سجّل الدخول لعرض طلباتك.'), findsOneWidget);
    });
  });

  group('location screen', () {
    Future<void> openLocation(
      WidgetTester tester,
      FakeApiClient api, {
      LocationProvider? location,
    }) async {
      await pumpApp(tester, api: api, location: location);
      await tester.tap(find.text('مارجريتا'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('السلة'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('choose-location')));
      await tester.pumpAndSettle();
    }

    testWidgets('uses the current location', (tester) async {
      final api = FakeApiClient();
      await openLocation(
        tester,
        api,
        location: FakeLocationProvider(point: const GeoPoint(31.2, 29.9)),
      );
      await tester.tap(find.byKey(const Key('use-current')));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextField, '31.2'), findsOneWidget);
      await tester.tap(find.byKey(const Key('confirm-location')));
      await tester.pumpAndSettle();
      expect(api.priceRequests.last.location, const GeoPoint(31.2, 29.9));
    });

    for (final entry in {
      LocationFailure.denied: 'تم رفض إذن الموقع',
      LocationFailure.disabled: 'خدمات الموقع متوقفة',
      LocationFailure.unavailable: 'تعذّر تحديد موقعك',
    }.entries) {
      testWidgets('shows a message when location is ${entry.key.name}', (
        tester,
      ) async {
        await openLocation(
          tester,
          FakeApiClient(),
          location: FakeLocationProvider(failure: entry.key),
        );
        await tester.tap(find.byKey(const Key('use-current')));
        await tester.pumpAndSettle();
        expect(find.textContaining(entry.value), findsOneWidget);
      });
    }

    testWidgets('manual coordinates are validated', (tester) async {
      final api = FakeApiClient();
      await openLocation(tester, api);
      await tester.enterText(find.byKey(const Key('lat')), '95');
      await tester.enterText(find.byKey(const Key('lng')), '31');
      await tester.tap(find.byKey(const Key('confirm-location')));
      await tester.pumpAndSettle();
      expect(find.textContaining('أدخل إحداثيات صحيحة'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('lat')), '30.0');
      await tester.tap(find.byKey(const Key('confirm-location')));
      await tester.pumpAndSettle();
      expect(api.priceRequests.last.location, const GeoPoint(30.0, 31.0));
    });
  });

  group('helpers', () {
    test('parseCoordinates', () {
      expect(parseCoordinates('30,5', '31.2'), const GeoPoint(30.5, 31.2));
      expect(parseCoordinates('٣٠', '٣١'), const GeoPoint(30, 31));
      expect(parseCoordinates('x', '1'), isNull);
      expect(parseCoordinates('91', '1'), isNull);
      expect(kLocationPresets.first.point, const GeoPoint(30.0444, 31.2357));
    });

    test('formatMoney uses Western digits and the right currency', () {
      final ar = lookupAppLocalizations(const Locale('ar'));
      final en = lookupAppLocalizations(const Locale('en'));
      expect(formatMoney(ar, 12000), '120 ج.م');
      expect(formatMoney(en, 12000), 'EGP 120');
      expect(formatMoney(ar, 12050), '120.50 ج.م');
      expect(formatMoney(en, 5), 'EGP 0.05');
      expect(formatMoney(en, -250), 'EGP -2.50');
    });

    test('every documented API error code has a localised message', () {
      const codes = [
        'INVALID_REQUEST',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'CONFLICT',
        'ILLEGAL_TRANSITION',
        'PAYMENT_PENDING',
        'INVALID_CART',
        'OUT_OF_ZONE',
        'BELOW_MINIMUM',
        'BRANCH_UNAVAILABLE',
        'RATE_LIMITED',
        'INTERNAL',
        'BAD_REQUEST',
        'NETWORK',
        'BAD_RESPONSE',
      ];
      for (final locale in ['ar', 'en']) {
        final l = lookupAppLocalizations(Locale(locale));
        final seen = <String>{};
        for (final code in codes) {
          final msg = apiErrorMessage(l, ApiException(status: 400, code: code));
          expect(msg, isNotEmpty);
          expect(msg, isNot(l.errUnknown), reason: code);
          seen.add(msg);
        }
        expect(seen.length, greaterThan(10));
        expect(
          apiErrorMessage(l, const ApiException(status: 401, code: 'X')),
          l.errUnauthorized,
        );
        expect(
          apiErrorMessage(l, const ApiException(status: 429, code: 'X')),
          l.errRateLimited,
        );
        expect(
          apiErrorMessage(l, const ApiException(status: 503, code: 'X')),
          l.errInternal,
        );
        expect(
          apiErrorMessage(l, const ApiException(status: 418, code: 'X')),
          l.errUnknown,
        );
        expect(
          apiErrorMessage(
            l,
            const ApiException(
              status: 429,
              code: 'RATE_LIMITED',
              retryAfterSeconds: 30,
            ),
          ),
          contains('30'),
        );
      }
    });

    test('status, payment and size names', () {
      final ar = lookupAppLocalizations(const Locale('ar'));
      for (final s in OrderStatus.values) {
        expect(statusName(ar, s), isNotEmpty);
      }
      expect(paymentStatusName(ar, 'PAID'), 'مدفوع');
      expect(paymentStatusName(ar, 'COD_PENDING'), isNotNull);
      expect(paymentStatusName(ar, 'UNPAID'), isNotNull);
      expect(paymentStatusName(ar, 'REFUNDED'), isNotNull);
      expect(paymentStatusName(ar, 'weird'), isNull);
      expect(sizeName(ar, 'S'), 'صغير');
      expect(sizeName(ar, 'L'), 'كبير');
      expect(sizeName(ar, 'regular'), 'عادي');
      expect(formatDateTime(DateTime(2026, 1, 2, 3, 4)), '02/01/2026 03:04');
    });
  });

  group('storage', () {
    test('PrefsSessionStore round-trips and clears', () async {
      SharedPreferences.setMockInitialValues({});
      final store = PrefsSessionStore();
      expect(await store.load(), isNull);
      await store.save(_session());
      final loaded = await store.load();
      expect(loaded!.token, 'tok');
      expect(loaded.phone, '+201012345678');
      await store.clear();
      expect(await store.load(), isNull);
    });

    test('LocaleNotifier defaults to Arabic, toggles and persists', () async {
      SharedPreferences.setMockInitialValues({});
      final n = LocaleNotifier();
      expect(n.locale.languageCode, 'ar');
      expect(n.isArabic, isTrue);
      await n.toggle();
      expect(n.locale.languageCode, 'en');
      await n.setLanguage('fr');
      expect(n.locale.languageCode, 'en');
      final restored = LocaleNotifier();
      await restored.restore();
      expect(restored.locale.languageCode, 'en');
    });
  });
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mpizza_app/api/api_client.dart';
import 'package:mpizza_app/api/api_exception.dart';
import 'package:mpizza_app/api/models/cart_models.dart';
import 'package:mpizza_app/api/models/menu_models.dart';
import 'package:mpizza_app/api/models/order_models.dart';
import 'package:mpizza_app/app.dart';
import 'package:mpizza_app/auth/session_store.dart';
import 'package:mpizza_app/checkout/location.dart';
import 'package:mpizza_app/l10n/locale_notifier.dart';

const Map<String, dynamic> sampleMenuJson = {
  'categories': [
    {
      'id': 1,
      'nameAr': 'بيتزا',
      'nameEn': 'Pizza',
      'items': [
        {
          'id': 1,
          'kind': 'pizza',
          'nameAr': 'مارجريتا',
          'nameEn': 'Margherita',
          'descriptionAr': 'جبنة وصلصة',
          'descriptionEn': 'Cheese and sauce',
          'imageUrl': null,
          'sizes': [
            {'id': 11, 'label': 'S', 'pricePiastres': 8000},
            {'id': 12, 'label': 'M', 'pricePiastres': 10000},
            {'id': 13, 'label': 'L', 'pricePiastres': 12000},
          ],
        },
        {
          'id': 2,
          'kind': 'pizza',
          'nameAr': 'بيبروني',
          'nameEn': 'Pepperoni',
          'descriptionAr': '',
          'descriptionEn': '',
          'imageUrl': null,
          'sizes': [
            {'id': 21, 'label': 'S', 'pricePiastres': 9000},
            {'id': 22, 'label': 'M', 'pricePiastres': 12000},
            {'id': 23, 'label': 'L', 'pricePiastres': 15000},
          ],
        },
        {
          'id': 3,
          'kind': 'pizza',
          'nameAr': 'سوبريم',
          'nameEn': 'Supreme',
          'descriptionAr': '',
          'descriptionEn': '',
          'imageUrl': null,
          'sizes': <Object>[],
        },
      ],
    },
    {
      'id': 2,
      'nameAr': 'مشروبات',
      'nameEn': 'Drinks',
      'items': [
        {
          'id': 10,
          'kind': 'drink',
          'nameAr': 'كولا',
          'nameEn': 'Cola',
          'descriptionAr': '',
          'descriptionEn': '',
          'imageUrl': null,
          'sizes': [
            {'id': 101, 'label': 'regular', 'pricePiastres': 2500},
          ],
        },
      ],
    },
  ],
  'crusts': [
    {'id': 1, 'nameAr': 'رفيعة', 'nameEn': 'Thin', 'priceDeltaPiastres': 0},
    {
      'id': 2,
      'nameAr': 'محشية جبنة',
      'nameEn': 'Cheese stuffed',
      'priceDeltaPiastres': 2500,
    },
  ],
  'toppings': [
    {
      'id': 1,
      'nameAr': 'مشروم',
      'nameEn': 'Mushrooms',
      'priceDeltaPiastres': 1500,
    },
    {
      'id': 2,
      'nameAr': 'زيتون',
      'nameEn': 'Olives',
      'priceDeltaPiastres': 1000,
    },
  ],
};

Menu sampleMenu() => Menu.fromJson(sampleMenuJson);

PriceQuote sampleQuote({
  int subtotal = 10000,
  int fee = 1500,
  int min = 5000,
  int lines = 1,
}) => PriceQuote(
  subtotalPiastres: subtotal,
  deliveryFeePiastres: fee,
  totalPiastres: subtotal + fee,
  minOrderPiastres: min,
  etaMinutes: 40,
  lines: [
    for (var i = 0; i < lines; i++)
      LineQuote(
        unitPiastres: subtotal ~/ lines,
        totalPiastres: subtotal ~/ lines,
      ),
  ],
);

CartLine marg({int qty = 1}) => CartLine(
  qty: qty,
  halves: const [PizzaHalf(side: HalfSide.whole, itemId: 1, sizeId: 12)],
);

OrderSummary sampleOrder({List<CartLine>? lines}) => OrderSummary(
  trackingToken: 'tok-1234567890abcdef',
  status: OrderStatus.delivered,
  paymentStatus: 'COD_COLLECTED',
  service: ServiceType.delivery,
  totalPiastres: 11500,
  createdAt: DateTime.utc(2026, 10, 1, 12, 30),
  lines: lines ?? [marg()],
);

TrackedOrder sampleTracked({
  OrderStatus status = OrderStatus.placed,
  ServiceType service = ServiceType.delivery,
}) => TrackedOrder(
  trackingToken: 'tok-1234567890abcdef',
  status: status,
  paymentStatus: 'COD_PENDING',
  service: service,
  totalPiastres: 11500,
  subtotalPiastres: 10000,
  deliveryFeePiastres: 1500,
  branchPhone: '+20221234567',
  createdAt: DateTime.utc(2026, 10, 1, 12, 30),
);

/// Scriptable fake. Override the closures per test.
class FakeApiClient implements ApiClient {
  @override
  String? authToken;

  Future<Menu> Function() onMenu = () async => sampleMenu();
  Future<PriceQuote> Function(CartRequest) onPrice = (r) async =>
      sampleQuote(lines: r.lines.length);
  Future<void> Function(String) onRequestOtp = (_) async {};
  Future<Session> Function(String, String) onVerify = (phone, code) async =>
      Session(
        token: 'session-token',
        expiresAt: DateTime.now().add(const Duration(days: 30)),
        phone: phone,
      );
  Future<void> Function() onLogout = () async {};
  Future<PlacedOrder> Function(CartRequest, PaymentMethod, String)
  onPlaceOrder = (c, m, k) async => const PlacedOrder(
    trackingToken: 'tok-1234567890abcdef',
    status: OrderStatus.placed,
    paymentStatus: 'COD_PENDING',
    totalPiastres: 11500,
  );
  Future<List<OrderSummary>> Function() onListOrders = () async => [
    sampleOrder(),
  ];
  Future<TrackedOrder> Function(String) onTrack = (t) async => sampleTracked();
  Future<String> Function(String) onStartPayment = (t) async =>
      'https://pay.example/checkout';
  Stream<StatusEvent> Function(String) onStream = (t) =>
      const Stream<StatusEvent>.empty();

  final List<CartRequest> priceRequests = [];
  final List<String> placedKeys = [];
  final List<Address?> placedAddresses = [];
  final List<String> otpRequests = [];
  int logoutCalls = 0;

  @override
  Future<Menu> getMenu() => onMenu();

  @override
  Future<PriceQuote> priceCart(CartRequest cart) {
    priceRequests.add(cart);
    return onPrice(cart);
  }

  @override
  Future<void> requestOtp(String phone) {
    otpRequests.add(phone);
    return onRequestOtp(phone);
  }

  @override
  Future<Session> verifyOtp(String phone, String code) => onVerify(phone, code);

  @override
  Future<void> logout() {
    logoutCalls++;
    return onLogout();
  }

  @override
  Future<PlacedOrder> placeOrder({
    required CartRequest cart,
    required PaymentMethod paymentMethod,
    required String idempotencyKey,
    Address? address,
    String? note,
  }) {
    placedKeys.add(idempotencyKey);
    placedAddresses.add(address);
    return onPlaceOrder(cart, paymentMethod, idempotencyKey);
  }

  @override
  Future<List<OrderSummary>> listOrders() => onListOrders();

  @override
  Future<TrackedOrder> trackOrder(String trackingToken) =>
      onTrack(trackingToken);

  @override
  Future<String> startOnlinePayment(String trackingToken) =>
      onStartPayment(trackingToken);

  @override
  Stream<StatusEvent> trackStream(String trackingToken) =>
      onStream(trackingToken);
}

class FakeLocationProvider implements LocationProvider {
  FakeLocationProvider({this.point, this.failure});
  final GeoPoint? point;
  final LocationFailure? failure;

  @override
  Future<GeoPoint> current() async {
    if (failure != null) throw LocationException(failure!);
    return point ?? const GeoPoint(30.0444, 31.2357);
  }
}

ApiException apiError(String code, int status, {int? retryAfter}) =>
    ApiException(
      status: status,
      code: code,
      message: 'x',
      retryAfterSeconds: retryAfter,
    );

/// Pumps the full app with fakes and a tall viewport.
Future<void> pumpApp(
  WidgetTester tester, {
  required FakeApiClient api,
  MemorySessionStore? store,
  String language = 'ar',
  LocationProvider? location,
}) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MPizzaApp(
      api: api,
      sessionStore: store ?? MemorySessionStore(),
      locationProvider: location ?? FakeLocationProvider(),
      localeNotifier: LocaleNotifier(initial: Locale(language)),
      priceDebounce: Duration.zero,
    ),
  );
  await tester.pumpAndSettle();
}

/// A controllable WebSocket-like message source.
class FakeSocket {
  final StreamController<String> controller = StreamController<String>();
  Uri? lastUri;

  Stream<String> connect(Uri uri) {
    lastUri = uri;
    return controller.stream;
  }
}

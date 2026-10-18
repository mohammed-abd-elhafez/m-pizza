import 'models/cart_models.dart';
import 'models/menu_models.dart';
import 'models/order_models.dart';

/// Everything the app needs from the M Pizza server. Tests use a fake.
abstract class ApiClient {
  /// Bearer token sent on authenticated calls; null when signed out.
  String? get authToken;
  set authToken(String? value);

  Future<Menu> getMenu();
  Future<PriceQuote> priceCart(CartRequest cart);

  Future<void> requestOtp(String phone);
  Future<Session> verifyOtp(String phone, String code);
  Future<void> logout();

  Future<PlacedOrder> placeOrder({
    required CartRequest cart,
    required PaymentMethod paymentMethod,
    required String idempotencyKey,
    Address? address,
    String? note,
  });
  Future<List<OrderSummary>> listOrders();
  Future<TrackedOrder> trackOrder(String trackingToken);
  Future<String> startOnlinePayment(String trackingToken);

  /// Live status events. Errors or completion mean the caller should poll.
  Stream<StatusEvent> trackStream(String trackingToken);
}

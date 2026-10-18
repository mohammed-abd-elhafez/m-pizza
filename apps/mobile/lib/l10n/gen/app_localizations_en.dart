// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'M Pizza';

  @override
  String get demoBanner =>
      'Demo version: no real orders are placed (any 6-digit code signs in)';

  @override
  String get navMenu => 'Menu';

  @override
  String get navCart => 'Cart';

  @override
  String get navOrders => 'Orders';

  @override
  String get actionRetry => 'Try again';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get switchLanguageLabel => 'العربية';

  @override
  String get languageTooltip => 'Change language';

  @override
  String get accountSignIn => 'Sign in';

  @override
  String get accountSignOut => 'Sign out';

  @override
  String accountSignedInAs(String phone) {
    return 'Signed in as $phone';
  }

  @override
  String money(String amount) {
    return 'EGP $amount';
  }

  @override
  String get loginTitle => 'Sign in to order';

  @override
  String get loginIntro =>
      'Browse the menu freely. We only need your mobile number when you place an order.';

  @override
  String get loginPhoneLabel => 'Mobile number';

  @override
  String get loginPhoneHelper => 'For example 01012345678';

  @override
  String get loginSendCode => 'Send code';

  @override
  String get loginCodeLabel => '6-digit code';

  @override
  String loginCodeSent(String phone) {
    return 'We sent a code to $phone';
  }

  @override
  String get loginVerify => 'Verify and continue';

  @override
  String get loginChangeNumber => 'Use a different number';

  @override
  String get loginResendCode => 'Send a new code';

  @override
  String get loginErrPhone =>
      'Enter a valid Egyptian mobile number, like 01012345678';

  @override
  String get loginErrCode => 'Enter the 6-digit code';

  @override
  String get loginCodeWrong =>
      'The code is wrong or has expired. Request a new one.';

  @override
  String get menuEmpty => 'The menu is empty right now.';

  @override
  String get menuLoadFailed => 'We couldn\'t load the menu.';

  @override
  String get menuHeroEyebrow => 'Fresh from the oven';

  @override
  String get menuHeroTitle => 'Pizza for your people';

  @override
  String get menuHeroBody =>
      'Pick your favourites, customize your pizza, and make it yours.';

  @override
  String get menuHeroCta => 'Pick your pizza';

  @override
  String get menuFeatured => 'Made for sharing';

  @override
  String get menuLocationTitle => 'Let us find you faster';

  @override
  String get menuLocationBody =>
      'Set your location to see delivery fees and the estimated time.';

  @override
  String get menuLocationSet => 'Delivery location set';

  @override
  String get menuLocationCta => 'Set location';

  @override
  String itemFromPrice(String price) {
    return 'From $price';
  }

  @override
  String get itemUnavailable => 'Unavailable';

  @override
  String get sizeLabelS => 'Small';

  @override
  String get sizeLabelM => 'Medium';

  @override
  String get sizeLabelL => 'Large';

  @override
  String get sizeLabelRegular => 'Regular';

  @override
  String get customizeSize => 'Size';

  @override
  String get customizeCrust => 'Crust';

  @override
  String get crustStandard => 'Standard';

  @override
  String get customizeToppings => 'Toppings';

  @override
  String get toppingsHint =>
      'Add extras or remove what you don\'t want. Removing is free.';

  @override
  String get toppingAdd => 'Add';

  @override
  String get toppingRemove => 'Remove';

  @override
  String get halfAndHalfTitle => 'Half and half';

  @override
  String get halfAndHalfSubtitle => 'Two different pizzas in one, same size.';

  @override
  String get halfAndHalfPriceNote =>
      'Price = the higher-priced half + crust + extras.';

  @override
  String get halfLeft => 'Left half';

  @override
  String get halfRight => 'Right half';

  @override
  String get halfWhole => 'Whole pizza';

  @override
  String get halfPickPizza => 'Pizza for this half';

  @override
  String get customizeQuantity => 'Quantity';

  @override
  String get customizeNote => 'Note for the kitchen (optional)';

  @override
  String customizeEstimate(String price) {
    return 'Estimated: $price';
  }

  @override
  String get customizeEstimateHint =>
      'The final price is confirmed in your cart.';

  @override
  String get customizeAdd => 'Add to cart';

  @override
  String get customizeUpdate => 'Update item';

  @override
  String get addedToCart => 'Added to cart';

  @override
  String get customizeUnavailable => 'This item is no longer available.';

  @override
  String get cartTitle => 'Your cart';

  @override
  String get cartEmptyTitle => 'Your cart is empty';

  @override
  String get cartEmptyBody => 'Pick something delicious from the menu.';

  @override
  String get cartBrowse => 'Browse the menu';

  @override
  String get serviceDelivery => 'Delivery';

  @override
  String get servicePickup => 'Pickup';

  @override
  String get cartPickupFrom => 'Pick up from our restaurant';

  @override
  String get cartChooseLocation => 'Choose delivery location';

  @override
  String get cartChangeLocation => 'Change location';

  @override
  String cartLocationSet(String lat, String lng) {
    return 'Delivering to $lat, $lng';
  }

  @override
  String get cartLocationNeeded =>
      'Choose your location to see the delivery fee.';

  @override
  String get cartSubtotal => 'Subtotal';

  @override
  String get cartDeliveryFee => 'Delivery fee';

  @override
  String get cartDeliveryFeePending => 'Set at your location';

  @override
  String get cartTotal => 'Total';

  @override
  String cartMinimum(String amount) {
    return 'Minimum order: $amount';
  }

  @override
  String cartBelowMinimum(String amount) {
    return 'Your order is below the $amount minimum for your area. Add more items to continue.';
  }

  @override
  String cartEta(int minutes) {
    return 'Estimated time: $minutes min';
  }

  @override
  String get cartPricing => 'Updating prices...';

  @override
  String get cartPriceFailed => 'We couldn\'t update the prices.';

  @override
  String get cartCheckout => 'Checkout';

  @override
  String get cartEdit => 'Edit';

  @override
  String get cartRemove => 'Remove';

  @override
  String get cartQtyDecrease => 'Decrease quantity';

  @override
  String get cartQtyIncrease => 'Increase quantity';

  @override
  String cartLineHalves(String a, String b) {
    return 'Half $a / half $b';
  }

  @override
  String cartLineCrust(String name) {
    return 'Crust: $name';
  }

  @override
  String cartLineAdded(String names) {
    return 'Extra: $names';
  }

  @override
  String cartLineRemoved(String names) {
    return 'Without: $names';
  }

  @override
  String cartLineNote(String note) {
    return 'Note: $note';
  }

  @override
  String get cartLineUnavailable => 'No longer available';

  @override
  String get locationTitle => 'Delivery location';

  @override
  String get locationPrivacyNote =>
      'We use your location only to calculate delivery fees and the estimated time.';

  @override
  String get locationUseCurrent => 'Use my current location';

  @override
  String get locationFinding => 'Finding your location...';

  @override
  String get locationManualTitle => 'Or enter coordinates';

  @override
  String get locationLat => 'Latitude';

  @override
  String get locationLng => 'Longitude';

  @override
  String get locationPresets => 'Quick points';

  @override
  String get presetDowntownCairo => 'Downtown Cairo';

  @override
  String get presetNasrCity => 'Nasr City';

  @override
  String get presetGiza => 'Giza';

  @override
  String get locationConfirm => 'Use this location';

  @override
  String get locationInvalid =>
      'Enter valid coordinates (latitude -90 to 90, longitude -180 to 180).';

  @override
  String get locationDenied =>
      'Location permission was denied. Enter coordinates or pick a quick point.';

  @override
  String get locationDisabled =>
      'Location services are turned off. Enter coordinates or pick a quick point.';

  @override
  String get locationUnavailable =>
      'We couldn\'t get your location. Enter coordinates or pick a quick point.';

  @override
  String get checkoutTitle => 'Checkout';

  @override
  String get checkoutAddressTitle => 'Delivery address';

  @override
  String get checkoutLandmark => 'Landmark';

  @override
  String get checkoutLandmarkHint => 'For example: next to the main mosque';

  @override
  String get checkoutLandmarkEmpty => 'A landmark is required';

  @override
  String get checkoutLandmarkShort =>
      'The landmark must be at least 3 characters';

  @override
  String get checkoutLandmarkLong =>
      'The landmark is too long (200 characters at most)';

  @override
  String get checkoutBuilding => 'Building (optional)';

  @override
  String get checkoutFloor => 'Floor (optional)';

  @override
  String get checkoutApartment => 'Apartment (optional)';

  @override
  String get checkoutAddressNotes => 'Address notes (optional)';

  @override
  String get checkoutOrderNote => 'Order note (optional)';

  @override
  String get checkoutFieldTooLong => 'Too long (200 characters at most)';

  @override
  String checkoutPhone(String phone) {
    return 'We will call $phone if needed';
  }

  @override
  String get checkoutPaymentTitle => 'Payment';

  @override
  String get payCod => 'Cash on receipt';

  @override
  String get payOnline => 'Pay online (card or wallet)';

  @override
  String get payOnlineUnavailable =>
      'Online payment isn\'t available yet. Pay in cash when you receive your order.';

  @override
  String get checkoutPlace => 'Place order';

  @override
  String get checkoutPlacing => 'Placing your order...';

  @override
  String get checkoutNeedLocation =>
      'Choose a delivery location in your cart first.';

  @override
  String get checkoutSummary => 'Order summary';

  @override
  String get errNetwork =>
      'Can\'t reach the server. Check your connection and try again.';

  @override
  String get errInvalidRequest =>
      'Some details are not valid. Please check and try again.';

  @override
  String get errUnauthorized => 'Your session has ended. Please sign in again.';

  @override
  String get errForbidden => 'You don\'t have permission to do that.';

  @override
  String get errNotFound => 'We couldn\'t find that.';

  @override
  String get errConflict =>
      'This order was already sent with different details. Please review and place it again.';

  @override
  String get errIllegalTransition => 'This order can\'t be changed any more.';

  @override
  String get errPaymentPending => 'This order is waiting for payment.';

  @override
  String get errInvalidCart =>
      'Something in your cart is no longer available. Please review your cart.';

  @override
  String get errOutOfZone =>
      'Sorry, we don\'t deliver to this location yet. Try another location or choose pickup.';

  @override
  String get errBelowMinimum =>
      'Your order is below the minimum for your area. Add more items.';

  @override
  String get errBranchUnavailable =>
      'The restaurant isn\'t taking orders right now. Please try again later.';

  @override
  String get errRateLimited =>
      'Too many attempts. Please wait a moment and try again.';

  @override
  String errRateLimitedWait(int seconds) {
    return 'Too many attempts. Please try again in $seconds seconds.';
  }

  @override
  String get errInternal =>
      'Something went wrong on our side. Please try again.';

  @override
  String get errBadResponse =>
      'We got an unexpected reply from the server. Please try again.';

  @override
  String get errUnknown => 'Something went wrong. Please try again.';

  @override
  String get trackTitle => 'Track your order';

  @override
  String get statusPlaced => 'Order placed';

  @override
  String get statusAccepted => 'Accepted';

  @override
  String get statusPreparing => 'Preparing';

  @override
  String get statusReady => 'Ready';

  @override
  String get statusOutForDelivery => 'Out for delivery';

  @override
  String get statusDelivered => 'Delivered';

  @override
  String get statusPickedUp => 'Picked up';

  @override
  String get statusCancelled => 'Cancelled';

  @override
  String get statusUnknown => 'Updating';

  @override
  String get trackCancelledNotice => 'This order was cancelled.';

  @override
  String get trackConnecting => 'Connecting for live updates...';

  @override
  String get trackLive => 'Live updates are on';

  @override
  String get trackPolling => 'Checking for updates every 10 seconds';

  @override
  String get trackFinished => 'This order is complete';

  @override
  String get trackBranchPhone => 'Restaurant phone';

  @override
  String get trackPayment => 'Payment';

  @override
  String get payStatusCodPending => 'Cash on receipt';

  @override
  String get payStatusCodCollected => 'Cash collected';

  @override
  String get payStatusUnpaid => 'Unpaid';

  @override
  String get payStatusPaid => 'Paid';

  @override
  String get payStatusRefunded => 'Refunded';

  @override
  String get trackLoadFailed => 'We couldn\'t load this order.';

  @override
  String get trackBackToMenu => 'Back to the menu';

  @override
  String trackPlacedAt(String date) {
    return 'Placed on $date';
  }

  @override
  String get ordersTitle => 'My orders';

  @override
  String get ordersEmpty => 'You haven\'t placed any orders yet.';

  @override
  String get ordersSignInPrompt => 'Sign in to see your orders.';

  @override
  String get ordersLoadFailed => 'We couldn\'t load your orders.';

  @override
  String get ordersReorder => 'Order again';

  @override
  String get ordersTrack => 'Track';

  @override
  String ordersItemCount(int count) {
    return 'Items: $count';
  }

  @override
  String reorderAdded(int count) {
    return 'Added $count item(s) to your cart';
  }

  @override
  String reorderDropped(int count) {
    return '$count item(s) are no longer available and were left out';
  }

  @override
  String get reorderNone =>
      'None of the items in this order are available now.';
}

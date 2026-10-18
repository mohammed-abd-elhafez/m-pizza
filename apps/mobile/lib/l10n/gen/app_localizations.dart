import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'M Pizza'**
  String get appTitle;

  /// No description provided for @demoBanner.
  ///
  /// In en, this message translates to:
  /// **'Demo version: no real orders are placed (any 6-digit code signs in)'**
  String get demoBanner;

  /// No description provided for @navMenu.
  ///
  /// In en, this message translates to:
  /// **'Menu'**
  String get navMenu;

  /// No description provided for @navCart.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get navCart;

  /// No description provided for @navOrders.
  ///
  /// In en, this message translates to:
  /// **'Orders'**
  String get navOrders;

  /// No description provided for @actionRetry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get actionRetry;

  /// No description provided for @actionCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get actionCancel;

  /// No description provided for @switchLanguageLabel.
  ///
  /// In en, this message translates to:
  /// **'العربية'**
  String get switchLanguageLabel;

  /// No description provided for @languageTooltip.
  ///
  /// In en, this message translates to:
  /// **'Change language'**
  String get languageTooltip;

  /// No description provided for @accountSignIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get accountSignIn;

  /// No description provided for @accountSignOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get accountSignOut;

  /// No description provided for @accountSignedInAs.
  ///
  /// In en, this message translates to:
  /// **'Signed in as {phone}'**
  String accountSignedInAs(String phone);

  /// No description provided for @money.
  ///
  /// In en, this message translates to:
  /// **'EGP {amount}'**
  String money(String amount);

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to order'**
  String get loginTitle;

  /// No description provided for @loginIntro.
  ///
  /// In en, this message translates to:
  /// **'Browse the menu freely. We only need your mobile number when you place an order.'**
  String get loginIntro;

  /// No description provided for @loginPhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get loginPhoneLabel;

  /// No description provided for @loginPhoneHelper.
  ///
  /// In en, this message translates to:
  /// **'For example 01012345678'**
  String get loginPhoneHelper;

  /// No description provided for @loginSendCode.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get loginSendCode;

  /// No description provided for @loginCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'6-digit code'**
  String get loginCodeLabel;

  /// No description provided for @loginCodeSent.
  ///
  /// In en, this message translates to:
  /// **'We sent a code to {phone}'**
  String loginCodeSent(String phone);

  /// No description provided for @loginVerify.
  ///
  /// In en, this message translates to:
  /// **'Verify and continue'**
  String get loginVerify;

  /// No description provided for @loginChangeNumber.
  ///
  /// In en, this message translates to:
  /// **'Use a different number'**
  String get loginChangeNumber;

  /// No description provided for @loginResendCode.
  ///
  /// In en, this message translates to:
  /// **'Send a new code'**
  String get loginResendCode;

  /// No description provided for @loginErrPhone.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid Egyptian mobile number, like 01012345678'**
  String get loginErrPhone;

  /// No description provided for @loginErrCode.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get loginErrCode;

  /// No description provided for @loginCodeWrong.
  ///
  /// In en, this message translates to:
  /// **'The code is wrong or has expired. Request a new one.'**
  String get loginCodeWrong;

  /// No description provided for @menuEmpty.
  ///
  /// In en, this message translates to:
  /// **'The menu is empty right now.'**
  String get menuEmpty;

  /// No description provided for @menuLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t load the menu.'**
  String get menuLoadFailed;

  /// No description provided for @menuHeroEyebrow.
  ///
  /// In en, this message translates to:
  /// **'Fresh from the oven'**
  String get menuHeroEyebrow;

  /// No description provided for @menuHeroTitle.
  ///
  /// In en, this message translates to:
  /// **'Pizza for your people'**
  String get menuHeroTitle;

  /// No description provided for @menuHeroBody.
  ///
  /// In en, this message translates to:
  /// **'Pick your favourites, customize your pizza, and make it yours.'**
  String get menuHeroBody;

  /// No description provided for @menuHeroCta.
  ///
  /// In en, this message translates to:
  /// **'Pick your pizza'**
  String get menuHeroCta;

  /// No description provided for @menuFeatured.
  ///
  /// In en, this message translates to:
  /// **'Made for sharing'**
  String get menuFeatured;

  /// No description provided for @menuLocationTitle.
  ///
  /// In en, this message translates to:
  /// **'Let us find you faster'**
  String get menuLocationTitle;

  /// No description provided for @menuLocationBody.
  ///
  /// In en, this message translates to:
  /// **'Set your location to see delivery fees and the estimated time.'**
  String get menuLocationBody;

  /// No description provided for @menuLocationSet.
  ///
  /// In en, this message translates to:
  /// **'Delivery location set'**
  String get menuLocationSet;

  /// No description provided for @menuLocationCta.
  ///
  /// In en, this message translates to:
  /// **'Set location'**
  String get menuLocationCta;

  /// No description provided for @itemFromPrice.
  ///
  /// In en, this message translates to:
  /// **'From {price}'**
  String itemFromPrice(String price);

  /// No description provided for @itemUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Unavailable'**
  String get itemUnavailable;

  /// No description provided for @sizeLabelS.
  ///
  /// In en, this message translates to:
  /// **'Small'**
  String get sizeLabelS;

  /// No description provided for @sizeLabelM.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get sizeLabelM;

  /// No description provided for @sizeLabelL.
  ///
  /// In en, this message translates to:
  /// **'Large'**
  String get sizeLabelL;

  /// No description provided for @sizeLabelRegular.
  ///
  /// In en, this message translates to:
  /// **'Regular'**
  String get sizeLabelRegular;

  /// No description provided for @customizeSize.
  ///
  /// In en, this message translates to:
  /// **'Size'**
  String get customizeSize;

  /// No description provided for @customizeCrust.
  ///
  /// In en, this message translates to:
  /// **'Crust'**
  String get customizeCrust;

  /// No description provided for @crustStandard.
  ///
  /// In en, this message translates to:
  /// **'Standard'**
  String get crustStandard;

  /// No description provided for @customizeToppings.
  ///
  /// In en, this message translates to:
  /// **'Toppings'**
  String get customizeToppings;

  /// No description provided for @toppingsHint.
  ///
  /// In en, this message translates to:
  /// **'Add extras or remove what you don\'t want. Removing is free.'**
  String get toppingsHint;

  /// No description provided for @toppingAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get toppingAdd;

  /// No description provided for @toppingRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get toppingRemove;

  /// No description provided for @halfAndHalfTitle.
  ///
  /// In en, this message translates to:
  /// **'Half and half'**
  String get halfAndHalfTitle;

  /// No description provided for @halfAndHalfSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Two different pizzas in one, same size.'**
  String get halfAndHalfSubtitle;

  /// No description provided for @halfAndHalfPriceNote.
  ///
  /// In en, this message translates to:
  /// **'Price = the higher-priced half + crust + extras.'**
  String get halfAndHalfPriceNote;

  /// No description provided for @halfLeft.
  ///
  /// In en, this message translates to:
  /// **'Left half'**
  String get halfLeft;

  /// No description provided for @halfRight.
  ///
  /// In en, this message translates to:
  /// **'Right half'**
  String get halfRight;

  /// No description provided for @halfWhole.
  ///
  /// In en, this message translates to:
  /// **'Whole pizza'**
  String get halfWhole;

  /// No description provided for @halfPickPizza.
  ///
  /// In en, this message translates to:
  /// **'Pizza for this half'**
  String get halfPickPizza;

  /// No description provided for @customizeQuantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get customizeQuantity;

  /// No description provided for @customizeNote.
  ///
  /// In en, this message translates to:
  /// **'Note for the kitchen (optional)'**
  String get customizeNote;

  /// No description provided for @customizeEstimate.
  ///
  /// In en, this message translates to:
  /// **'Estimated: {price}'**
  String customizeEstimate(String price);

  /// No description provided for @customizeEstimateHint.
  ///
  /// In en, this message translates to:
  /// **'The final price is confirmed in your cart.'**
  String get customizeEstimateHint;

  /// No description provided for @customizeAdd.
  ///
  /// In en, this message translates to:
  /// **'Add to cart'**
  String get customizeAdd;

  /// No description provided for @customizeUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update item'**
  String get customizeUpdate;

  /// No description provided for @addedToCart.
  ///
  /// In en, this message translates to:
  /// **'Added to cart'**
  String get addedToCart;

  /// No description provided for @customizeUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This item is no longer available.'**
  String get customizeUnavailable;

  /// No description provided for @cartTitle.
  ///
  /// In en, this message translates to:
  /// **'Your cart'**
  String get cartTitle;

  /// No description provided for @cartEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty'**
  String get cartEmptyTitle;

  /// No description provided for @cartEmptyBody.
  ///
  /// In en, this message translates to:
  /// **'Pick something delicious from the menu.'**
  String get cartEmptyBody;

  /// No description provided for @cartBrowse.
  ///
  /// In en, this message translates to:
  /// **'Browse the menu'**
  String get cartBrowse;

  /// No description provided for @serviceDelivery.
  ///
  /// In en, this message translates to:
  /// **'Delivery'**
  String get serviceDelivery;

  /// No description provided for @servicePickup.
  ///
  /// In en, this message translates to:
  /// **'Pickup'**
  String get servicePickup;

  /// No description provided for @cartPickupFrom.
  ///
  /// In en, this message translates to:
  /// **'Pick up from our restaurant'**
  String get cartPickupFrom;

  /// No description provided for @cartChooseLocation.
  ///
  /// In en, this message translates to:
  /// **'Choose delivery location'**
  String get cartChooseLocation;

  /// No description provided for @cartChangeLocation.
  ///
  /// In en, this message translates to:
  /// **'Change location'**
  String get cartChangeLocation;

  /// No description provided for @cartLocationSet.
  ///
  /// In en, this message translates to:
  /// **'Delivering to {lat}, {lng}'**
  String cartLocationSet(String lat, String lng);

  /// No description provided for @cartLocationNeeded.
  ///
  /// In en, this message translates to:
  /// **'Choose your location to see the delivery fee.'**
  String get cartLocationNeeded;

  /// No description provided for @cartSubtotal.
  ///
  /// In en, this message translates to:
  /// **'Subtotal'**
  String get cartSubtotal;

  /// No description provided for @cartDeliveryFee.
  ///
  /// In en, this message translates to:
  /// **'Delivery fee'**
  String get cartDeliveryFee;

  /// No description provided for @cartDeliveryFeePending.
  ///
  /// In en, this message translates to:
  /// **'Set at your location'**
  String get cartDeliveryFeePending;

  /// No description provided for @cartTotal.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get cartTotal;

  /// No description provided for @cartMinimum.
  ///
  /// In en, this message translates to:
  /// **'Minimum order: {amount}'**
  String cartMinimum(String amount);

  /// No description provided for @cartBelowMinimum.
  ///
  /// In en, this message translates to:
  /// **'Your order is below the {amount} minimum for your area. Add more items to continue.'**
  String cartBelowMinimum(String amount);

  /// No description provided for @cartEta.
  ///
  /// In en, this message translates to:
  /// **'Estimated time: {minutes} min'**
  String cartEta(int minutes);

  /// No description provided for @cartPricing.
  ///
  /// In en, this message translates to:
  /// **'Updating prices...'**
  String get cartPricing;

  /// No description provided for @cartPriceFailed.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t update the prices.'**
  String get cartPriceFailed;

  /// No description provided for @cartCheckout.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get cartCheckout;

  /// No description provided for @cartEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get cartEdit;

  /// No description provided for @cartRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get cartRemove;

  /// No description provided for @cartQtyDecrease.
  ///
  /// In en, this message translates to:
  /// **'Decrease quantity'**
  String get cartQtyDecrease;

  /// No description provided for @cartQtyIncrease.
  ///
  /// In en, this message translates to:
  /// **'Increase quantity'**
  String get cartQtyIncrease;

  /// No description provided for @cartLineHalves.
  ///
  /// In en, this message translates to:
  /// **'Half {a} / half {b}'**
  String cartLineHalves(String a, String b);

  /// No description provided for @cartLineCrust.
  ///
  /// In en, this message translates to:
  /// **'Crust: {name}'**
  String cartLineCrust(String name);

  /// No description provided for @cartLineAdded.
  ///
  /// In en, this message translates to:
  /// **'Extra: {names}'**
  String cartLineAdded(String names);

  /// No description provided for @cartLineRemoved.
  ///
  /// In en, this message translates to:
  /// **'Without: {names}'**
  String cartLineRemoved(String names);

  /// No description provided for @cartLineNote.
  ///
  /// In en, this message translates to:
  /// **'Note: {note}'**
  String cartLineNote(String note);

  /// No description provided for @cartLineUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No longer available'**
  String get cartLineUnavailable;

  /// No description provided for @locationTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery location'**
  String get locationTitle;

  /// No description provided for @locationPrivacyNote.
  ///
  /// In en, this message translates to:
  /// **'We use your location only to calculate delivery fees and the estimated time.'**
  String get locationPrivacyNote;

  /// No description provided for @locationUseCurrent.
  ///
  /// In en, this message translates to:
  /// **'Use my current location'**
  String get locationUseCurrent;

  /// No description provided for @locationFinding.
  ///
  /// In en, this message translates to:
  /// **'Finding your location...'**
  String get locationFinding;

  /// No description provided for @locationManualTitle.
  ///
  /// In en, this message translates to:
  /// **'Or enter coordinates'**
  String get locationManualTitle;

  /// No description provided for @locationLat.
  ///
  /// In en, this message translates to:
  /// **'Latitude'**
  String get locationLat;

  /// No description provided for @locationLng.
  ///
  /// In en, this message translates to:
  /// **'Longitude'**
  String get locationLng;

  /// No description provided for @locationPresets.
  ///
  /// In en, this message translates to:
  /// **'Quick points'**
  String get locationPresets;

  /// No description provided for @presetDowntownCairo.
  ///
  /// In en, this message translates to:
  /// **'Downtown Cairo'**
  String get presetDowntownCairo;

  /// No description provided for @presetNasrCity.
  ///
  /// In en, this message translates to:
  /// **'Nasr City'**
  String get presetNasrCity;

  /// No description provided for @presetGiza.
  ///
  /// In en, this message translates to:
  /// **'Giza'**
  String get presetGiza;

  /// No description provided for @locationConfirm.
  ///
  /// In en, this message translates to:
  /// **'Use this location'**
  String get locationConfirm;

  /// No description provided for @locationInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter valid coordinates (latitude -90 to 90, longitude -180 to 180).'**
  String get locationInvalid;

  /// No description provided for @locationDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission was denied. Enter coordinates or pick a quick point.'**
  String get locationDenied;

  /// No description provided for @locationDisabled.
  ///
  /// In en, this message translates to:
  /// **'Location services are turned off. Enter coordinates or pick a quick point.'**
  String get locationDisabled;

  /// No description provided for @locationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t get your location. Enter coordinates or pick a quick point.'**
  String get locationUnavailable;

  /// No description provided for @checkoutTitle.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get checkoutTitle;

  /// No description provided for @checkoutAddressTitle.
  ///
  /// In en, this message translates to:
  /// **'Delivery address'**
  String get checkoutAddressTitle;

  /// No description provided for @checkoutLandmark.
  ///
  /// In en, this message translates to:
  /// **'Landmark'**
  String get checkoutLandmark;

  /// No description provided for @checkoutLandmarkHint.
  ///
  /// In en, this message translates to:
  /// **'For example: next to the main mosque'**
  String get checkoutLandmarkHint;

  /// No description provided for @checkoutLandmarkEmpty.
  ///
  /// In en, this message translates to:
  /// **'A landmark is required'**
  String get checkoutLandmarkEmpty;

  /// No description provided for @checkoutLandmarkShort.
  ///
  /// In en, this message translates to:
  /// **'The landmark must be at least 3 characters'**
  String get checkoutLandmarkShort;

  /// No description provided for @checkoutLandmarkLong.
  ///
  /// In en, this message translates to:
  /// **'The landmark is too long (200 characters at most)'**
  String get checkoutLandmarkLong;

  /// No description provided for @checkoutBuilding.
  ///
  /// In en, this message translates to:
  /// **'Building (optional)'**
  String get checkoutBuilding;

  /// No description provided for @checkoutFloor.
  ///
  /// In en, this message translates to:
  /// **'Floor (optional)'**
  String get checkoutFloor;

  /// No description provided for @checkoutApartment.
  ///
  /// In en, this message translates to:
  /// **'Apartment (optional)'**
  String get checkoutApartment;

  /// No description provided for @checkoutAddressNotes.
  ///
  /// In en, this message translates to:
  /// **'Address notes (optional)'**
  String get checkoutAddressNotes;

  /// No description provided for @checkoutOrderNote.
  ///
  /// In en, this message translates to:
  /// **'Order note (optional)'**
  String get checkoutOrderNote;

  /// No description provided for @checkoutFieldTooLong.
  ///
  /// In en, this message translates to:
  /// **'Too long (200 characters at most)'**
  String get checkoutFieldTooLong;

  /// No description provided for @checkoutPhone.
  ///
  /// In en, this message translates to:
  /// **'We will call {phone} if needed'**
  String checkoutPhone(String phone);

  /// No description provided for @checkoutPaymentTitle.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get checkoutPaymentTitle;

  /// No description provided for @payCod.
  ///
  /// In en, this message translates to:
  /// **'Cash on receipt'**
  String get payCod;

  /// No description provided for @payOnline.
  ///
  /// In en, this message translates to:
  /// **'Pay online (card or wallet)'**
  String get payOnline;

  /// No description provided for @payOnlineUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Online payment isn\'t available yet. Pay in cash when you receive your order.'**
  String get payOnlineUnavailable;

  /// No description provided for @checkoutPlace.
  ///
  /// In en, this message translates to:
  /// **'Place order'**
  String get checkoutPlace;

  /// No description provided for @checkoutPlacing.
  ///
  /// In en, this message translates to:
  /// **'Placing your order...'**
  String get checkoutPlacing;

  /// No description provided for @checkoutNeedLocation.
  ///
  /// In en, this message translates to:
  /// **'Choose a delivery location in your cart first.'**
  String get checkoutNeedLocation;

  /// No description provided for @checkoutSummary.
  ///
  /// In en, this message translates to:
  /// **'Order summary'**
  String get checkoutSummary;

  /// No description provided for @errNetwork.
  ///
  /// In en, this message translates to:
  /// **'Can\'t reach the server. Check your connection and try again.'**
  String get errNetwork;

  /// No description provided for @errInvalidRequest.
  ///
  /// In en, this message translates to:
  /// **'Some details are not valid. Please check and try again.'**
  String get errInvalidRequest;

  /// No description provided for @errUnauthorized.
  ///
  /// In en, this message translates to:
  /// **'Your session has ended. Please sign in again.'**
  String get errUnauthorized;

  /// No description provided for @errForbidden.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have permission to do that.'**
  String get errForbidden;

  /// No description provided for @errNotFound.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t find that.'**
  String get errNotFound;

  /// No description provided for @errConflict.
  ///
  /// In en, this message translates to:
  /// **'This order was already sent with different details. Please review and place it again.'**
  String get errConflict;

  /// No description provided for @errIllegalTransition.
  ///
  /// In en, this message translates to:
  /// **'This order can\'t be changed any more.'**
  String get errIllegalTransition;

  /// No description provided for @errPaymentPending.
  ///
  /// In en, this message translates to:
  /// **'This order is waiting for payment.'**
  String get errPaymentPending;

  /// No description provided for @errInvalidCart.
  ///
  /// In en, this message translates to:
  /// **'Something in your cart is no longer available. Please review your cart.'**
  String get errInvalidCart;

  /// No description provided for @errOutOfZone.
  ///
  /// In en, this message translates to:
  /// **'Sorry, we don\'t deliver to this location yet. Try another location or choose pickup.'**
  String get errOutOfZone;

  /// No description provided for @errBelowMinimum.
  ///
  /// In en, this message translates to:
  /// **'Your order is below the minimum for your area. Add more items.'**
  String get errBelowMinimum;

  /// No description provided for @errBranchUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The restaurant isn\'t taking orders right now. Please try again later.'**
  String get errBranchUnavailable;

  /// No description provided for @errRateLimited.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please wait a moment and try again.'**
  String get errRateLimited;

  /// No description provided for @errRateLimitedWait.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please try again in {seconds} seconds.'**
  String errRateLimitedWait(int seconds);

  /// No description provided for @errInternal.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong on our side. Please try again.'**
  String get errInternal;

  /// No description provided for @errBadResponse.
  ///
  /// In en, this message translates to:
  /// **'We got an unexpected reply from the server. Please try again.'**
  String get errBadResponse;

  /// No description provided for @errUnknown.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get errUnknown;

  /// No description provided for @trackTitle.
  ///
  /// In en, this message translates to:
  /// **'Track your order'**
  String get trackTitle;

  /// No description provided for @statusPlaced.
  ///
  /// In en, this message translates to:
  /// **'Order placed'**
  String get statusPlaced;

  /// No description provided for @statusAccepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get statusAccepted;

  /// No description provided for @statusPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing'**
  String get statusPreparing;

  /// No description provided for @statusReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get statusReady;

  /// No description provided for @statusOutForDelivery.
  ///
  /// In en, this message translates to:
  /// **'Out for delivery'**
  String get statusOutForDelivery;

  /// No description provided for @statusDelivered.
  ///
  /// In en, this message translates to:
  /// **'Delivered'**
  String get statusDelivered;

  /// No description provided for @statusPickedUp.
  ///
  /// In en, this message translates to:
  /// **'Picked up'**
  String get statusPickedUp;

  /// No description provided for @statusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get statusCancelled;

  /// No description provided for @statusUnknown.
  ///
  /// In en, this message translates to:
  /// **'Updating'**
  String get statusUnknown;

  /// No description provided for @trackCancelledNotice.
  ///
  /// In en, this message translates to:
  /// **'This order was cancelled.'**
  String get trackCancelledNotice;

  /// No description provided for @trackConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting for live updates...'**
  String get trackConnecting;

  /// No description provided for @trackLive.
  ///
  /// In en, this message translates to:
  /// **'Live updates are on'**
  String get trackLive;

  /// No description provided for @trackPolling.
  ///
  /// In en, this message translates to:
  /// **'Checking for updates every 10 seconds'**
  String get trackPolling;

  /// No description provided for @trackFinished.
  ///
  /// In en, this message translates to:
  /// **'This order is complete'**
  String get trackFinished;

  /// No description provided for @trackBranchPhone.
  ///
  /// In en, this message translates to:
  /// **'Restaurant phone'**
  String get trackBranchPhone;

  /// No description provided for @trackPayment.
  ///
  /// In en, this message translates to:
  /// **'Payment'**
  String get trackPayment;

  /// No description provided for @payStatusCodPending.
  ///
  /// In en, this message translates to:
  /// **'Cash on receipt'**
  String get payStatusCodPending;

  /// No description provided for @payStatusCodCollected.
  ///
  /// In en, this message translates to:
  /// **'Cash collected'**
  String get payStatusCodCollected;

  /// No description provided for @payStatusUnpaid.
  ///
  /// In en, this message translates to:
  /// **'Unpaid'**
  String get payStatusUnpaid;

  /// No description provided for @payStatusPaid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get payStatusPaid;

  /// No description provided for @payStatusRefunded.
  ///
  /// In en, this message translates to:
  /// **'Refunded'**
  String get payStatusRefunded;

  /// No description provided for @trackLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t load this order.'**
  String get trackLoadFailed;

  /// No description provided for @trackBackToMenu.
  ///
  /// In en, this message translates to:
  /// **'Back to the menu'**
  String get trackBackToMenu;

  /// No description provided for @trackPlacedAt.
  ///
  /// In en, this message translates to:
  /// **'Placed on {date}'**
  String trackPlacedAt(String date);

  /// No description provided for @ordersTitle.
  ///
  /// In en, this message translates to:
  /// **'My orders'**
  String get ordersTitle;

  /// No description provided for @ordersEmpty.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t placed any orders yet.'**
  String get ordersEmpty;

  /// No description provided for @ordersSignInPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to see your orders.'**
  String get ordersSignInPrompt;

  /// No description provided for @ordersLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t load your orders.'**
  String get ordersLoadFailed;

  /// No description provided for @ordersReorder.
  ///
  /// In en, this message translates to:
  /// **'Order again'**
  String get ordersReorder;

  /// No description provided for @ordersTrack.
  ///
  /// In en, this message translates to:
  /// **'Track'**
  String get ordersTrack;

  /// No description provided for @ordersItemCount.
  ///
  /// In en, this message translates to:
  /// **'Items: {count}'**
  String ordersItemCount(int count);

  /// No description provided for @reorderAdded.
  ///
  /// In en, this message translates to:
  /// **'Added {count} item(s) to your cart'**
  String reorderAdded(int count);

  /// No description provided for @reorderDropped.
  ///
  /// In en, this message translates to:
  /// **'{count} item(s) are no longer available and were left out'**
  String reorderDropped(int count);

  /// No description provided for @reorderNone.
  ///
  /// In en, this message translates to:
  /// **'None of the items in this order are available now.'**
  String get reorderNone;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}

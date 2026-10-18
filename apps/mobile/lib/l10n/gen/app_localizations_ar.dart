// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'إم بيتزا';

  @override
  String get demoBanner =>
      'نسخة تجريبية: لا يتم تنفيذ طلبات حقيقية (أي كود من 6 أرقام يفتح الدخول)';

  @override
  String get navMenu => 'القائمة';

  @override
  String get navCart => 'السلة';

  @override
  String get navOrders => 'طلباتي';

  @override
  String get actionRetry => 'حاول مرة أخرى';

  @override
  String get actionCancel => 'إلغاء';

  @override
  String get switchLanguageLabel => 'English';

  @override
  String get languageTooltip => 'تغيير اللغة';

  @override
  String get accountSignIn => 'تسجيل الدخول';

  @override
  String get accountSignOut => 'تسجيل الخروج';

  @override
  String accountSignedInAs(String phone) {
    return 'مسجل الدخول برقم $phone';
  }

  @override
  String money(String amount) {
    return '$amount ج.م';
  }

  @override
  String get loginTitle => 'سجّل الدخول لإتمام الطلب';

  @override
  String get loginIntro =>
      'تصفّح القائمة براحتك. نحتاج رقم موبايلك فقط عند تأكيد الطلب.';

  @override
  String get loginPhoneLabel => 'رقم الموبايل';

  @override
  String get loginPhoneHelper => 'مثال: 01012345678';

  @override
  String get loginSendCode => 'إرسال الكود';

  @override
  String get loginCodeLabel => 'الكود المكوّن من 6 أرقام';

  @override
  String loginCodeSent(String phone) {
    return 'أرسلنا كودًا إلى $phone';
  }

  @override
  String get loginVerify => 'تأكيد ومتابعة';

  @override
  String get loginChangeNumber => 'استخدام رقم آخر';

  @override
  String get loginResendCode => 'إرسال كود جديد';

  @override
  String get loginErrPhone => 'أدخل رقم موبايل مصري صحيح مثل 01012345678';

  @override
  String get loginErrCode => 'أدخل الكود المكوّن من 6 أرقام';

  @override
  String get loginCodeWrong =>
      'الكود غير صحيح أو انتهت صلاحيته. اطلب كودًا جديدًا.';

  @override
  String get menuEmpty => 'القائمة فارغة حاليًا.';

  @override
  String get menuLoadFailed => 'تعذّر تحميل القائمة.';

  @override
  String itemFromPrice(String price) {
    return 'يبدأ من $price';
  }

  @override
  String get itemUnavailable => 'غير متاح';

  @override
  String get sizeLabelS => 'صغير';

  @override
  String get sizeLabelM => 'وسط';

  @override
  String get sizeLabelL => 'كبير';

  @override
  String get sizeLabelRegular => 'عادي';

  @override
  String get customizeSize => 'الحجم';

  @override
  String get customizeCrust => 'نوع العجينة';

  @override
  String get crustStandard => 'عادية';

  @override
  String get customizeToppings => 'الإضافات';

  @override
  String get toppingsHint => 'أضف إضافات أو احذف ما لا تريده. الحذف مجاني.';

  @override
  String get toppingAdd => 'إضافة';

  @override
  String get toppingRemove => 'بدون';

  @override
  String get halfAndHalfTitle => 'نصف ونصف';

  @override
  String get halfAndHalfSubtitle => 'بيتزاتان مختلفتان في واحدة، بنفس الحجم.';

  @override
  String get halfAndHalfPriceNote =>
      'السعر = سعر النصف الأعلى + العجينة + الإضافات.';

  @override
  String get halfLeft => 'النصف الأيسر';

  @override
  String get halfRight => 'النصف الأيمن';

  @override
  String get halfWhole => 'بيتزا كاملة';

  @override
  String get halfPickPizza => 'بيتزا هذا النصف';

  @override
  String get customizeQuantity => 'الكمية';

  @override
  String get customizeNote => 'ملاحظة للمطبخ (اختياري)';

  @override
  String customizeEstimate(String price) {
    return 'السعر التقريبي: $price';
  }

  @override
  String get customizeEstimateHint => 'السعر النهائي يتأكد في السلة.';

  @override
  String get customizeAdd => 'أضف إلى السلة';

  @override
  String get customizeUpdate => 'تحديث الصنف';

  @override
  String get addedToCart => 'تمت الإضافة إلى السلة';

  @override
  String get customizeUnavailable => 'هذا الصنف لم يعد متاحًا.';

  @override
  String get cartTitle => 'سلتك';

  @override
  String get cartEmptyTitle => 'سلتك فارغة';

  @override
  String get cartEmptyBody => 'اختر شيئًا لذيذًا من القائمة.';

  @override
  String get cartBrowse => 'تصفّح القائمة';

  @override
  String get serviceDelivery => 'توصيل';

  @override
  String get servicePickup => 'استلام من المطعم';

  @override
  String get cartPickupFrom => 'استلام من مطعمنا';

  @override
  String get cartChooseLocation => 'اختر موقع التوصيل';

  @override
  String get cartChangeLocation => 'تغيير الموقع';

  @override
  String cartLocationSet(String lat, String lng) {
    return 'التوصيل إلى $lat، $lng';
  }

  @override
  String get cartLocationNeeded => 'اختر موقعك لمعرفة رسوم التوصيل.';

  @override
  String get cartSubtotal => 'المجموع الفرعي';

  @override
  String get cartDeliveryFee => 'رسوم التوصيل';

  @override
  String get cartDeliveryFeePending => 'تُحدد حسب موقعك';

  @override
  String get cartTotal => 'الإجمالي';

  @override
  String cartMinimum(String amount) {
    return 'الحد الأدنى للطلب: $amount';
  }

  @override
  String cartBelowMinimum(String amount) {
    return 'طلبك أقل من الحد الأدنى ($amount) لمنطقتك. أضف المزيد من الأصناف للمتابعة.';
  }

  @override
  String cartEta(int minutes) {
    return 'الوقت المتوقع: $minutes دقيقة';
  }

  @override
  String get cartPricing => 'جارٍ تحديث الأسعار...';

  @override
  String get cartPriceFailed => 'تعذّر تحديث الأسعار.';

  @override
  String get cartCheckout => 'إتمام الطلب';

  @override
  String get cartEdit => 'تعديل';

  @override
  String get cartRemove => 'حذف';

  @override
  String get cartQtyDecrease => 'إنقاص الكمية';

  @override
  String get cartQtyIncrease => 'زيادة الكمية';

  @override
  String cartLineHalves(String a, String b) {
    return 'نصف $a / نصف $b';
  }

  @override
  String cartLineCrust(String name) {
    return 'العجينة: $name';
  }

  @override
  String cartLineAdded(String names) {
    return 'إضافات: $names';
  }

  @override
  String cartLineRemoved(String names) {
    return 'بدون: $names';
  }

  @override
  String cartLineNote(String note) {
    return 'ملاحظة: $note';
  }

  @override
  String get cartLineUnavailable => 'لم يعد متاحًا';

  @override
  String get locationTitle => 'موقع التوصيل';

  @override
  String get locationUseCurrent => 'استخدم موقعي الحالي';

  @override
  String get locationFinding => 'جارٍ تحديد موقعك...';

  @override
  String get locationManualTitle => 'أو أدخل الإحداثيات';

  @override
  String get locationLat => 'خط العرض';

  @override
  String get locationLng => 'خط الطول';

  @override
  String get locationPresets => 'نقاط سريعة';

  @override
  String get presetDowntownCairo => 'وسط البلد - القاهرة';

  @override
  String get presetNasrCity => 'مدينة نصر';

  @override
  String get presetGiza => 'الجيزة';

  @override
  String get locationConfirm => 'استخدم هذا الموقع';

  @override
  String get locationInvalid =>
      'أدخل إحداثيات صحيحة (خط العرض من -90 إلى 90، خط الطول من -180 إلى 180).';

  @override
  String get locationDenied =>
      'تم رفض إذن الموقع. أدخل الإحداثيات أو اختر نقطة سريعة.';

  @override
  String get locationDisabled =>
      'خدمات الموقع متوقفة. أدخل الإحداثيات أو اختر نقطة سريعة.';

  @override
  String get locationUnavailable =>
      'تعذّر تحديد موقعك. أدخل الإحداثيات أو اختر نقطة سريعة.';

  @override
  String get checkoutTitle => 'إتمام الطلب';

  @override
  String get checkoutAddressTitle => 'عنوان التوصيل';

  @override
  String get checkoutLandmark => 'علامة مميزة';

  @override
  String get checkoutLandmarkHint => 'مثال: بجوار المسجد الكبير';

  @override
  String get checkoutLandmarkEmpty => 'العلامة المميزة مطلوبة';

  @override
  String get checkoutLandmarkShort => 'يجب ألا تقل العلامة المميزة عن 3 أحرف';

  @override
  String get checkoutLandmarkLong =>
      'العلامة المميزة طويلة جدًا (200 حرف كحد أقصى)';

  @override
  String get checkoutBuilding => 'المبنى (اختياري)';

  @override
  String get checkoutFloor => 'الدور (اختياري)';

  @override
  String get checkoutApartment => 'الشقة (اختياري)';

  @override
  String get checkoutAddressNotes => 'ملاحظات العنوان (اختياري)';

  @override
  String get checkoutOrderNote => 'ملاحظة على الطلب (اختياري)';

  @override
  String get checkoutFieldTooLong => 'النص طويل جدًا (200 حرف كحد أقصى)';

  @override
  String checkoutPhone(String phone) {
    return 'سنتصل بك على $phone عند الحاجة';
  }

  @override
  String get checkoutPaymentTitle => 'الدفع';

  @override
  String get payCod => 'الدفع عند الاستلام';

  @override
  String get payOnline => 'الدفع أونلاين (بطاقة أو محفظة)';

  @override
  String get payOnlineUnavailable =>
      'الدفع أونلاين غير متاح حاليًا. ادفع نقدًا عند استلام طلبك.';

  @override
  String get checkoutPlace => 'تأكيد الطلب';

  @override
  String get checkoutPlacing => 'جارٍ إرسال طلبك...';

  @override
  String get checkoutNeedLocation => 'اختر موقع التوصيل من السلة أولًا.';

  @override
  String get checkoutSummary => 'ملخص الطلب';

  @override
  String get errNetwork =>
      'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.';

  @override
  String get errInvalidRequest =>
      'بعض البيانات غير صحيحة. راجعها وحاول مرة أخرى.';

  @override
  String get errUnauthorized => 'انتهت جلستك. من فضلك سجّل الدخول مرة أخرى.';

  @override
  String get errForbidden => 'ليس لديك صلاحية لهذا الإجراء.';

  @override
  String get errNotFound => 'لم نعثر على المطلوب.';

  @override
  String get errConflict =>
      'تم إرسال هذا الطلب سابقًا ببيانات مختلفة. راجع الطلب وأرسله مرة أخرى.';

  @override
  String get errIllegalTransition => 'لا يمكن تغيير هذا الطلب بعد الآن.';

  @override
  String get errPaymentPending => 'هذا الطلب في انتظار الدفع.';

  @override
  String get errInvalidCart =>
      'يوجد صنف في سلتك لم يعد متاحًا. من فضلك راجع السلة.';

  @override
  String get errOutOfZone =>
      'عذرًا، لا نوصّل إلى هذا الموقع حاليًا. جرّب موقعًا آخر أو اختر الاستلام من المطعم.';

  @override
  String get errBelowMinimum =>
      'طلبك أقل من الحد الأدنى لمنطقتك. أضف المزيد من الأصناف.';

  @override
  String get errBranchUnavailable =>
      'المطعم لا يستقبل طلبات حاليًا. حاول لاحقًا.';

  @override
  String get errRateLimited => 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.';

  @override
  String errRateLimitedWait(int seconds) {
    return 'محاولات كثيرة. حاول مرة أخرى بعد $seconds ثانية.';
  }

  @override
  String get errInternal => 'حدث خطأ من جانبنا. حاول مرة أخرى.';

  @override
  String get errBadResponse => 'وصلنا رد غير متوقع من الخادم. حاول مرة أخرى.';

  @override
  String get errUnknown => 'حدث خطأ ما. حاول مرة أخرى.';

  @override
  String get trackTitle => 'تتبّع طلبك';

  @override
  String get statusPlaced => 'تم استلام الطلب';

  @override
  String get statusAccepted => 'تم قبول الطلب';

  @override
  String get statusPreparing => 'جارٍ التحضير';

  @override
  String get statusReady => 'جاهز';

  @override
  String get statusOutForDelivery => 'في الطريق إليك';

  @override
  String get statusDelivered => 'تم التوصيل';

  @override
  String get statusPickedUp => 'تم الاستلام';

  @override
  String get statusCancelled => 'ملغي';

  @override
  String get statusUnknown => 'جارٍ التحديث';

  @override
  String get trackCancelledNotice => 'تم إلغاء هذا الطلب.';

  @override
  String get trackConnecting => 'جارٍ الاتصال بالتحديثات المباشرة...';

  @override
  String get trackLive => 'التحديثات المباشرة تعمل';

  @override
  String get trackPolling => 'نتحقق من التحديثات كل 10 ثوانٍ';

  @override
  String get trackFinished => 'اكتمل هذا الطلب';

  @override
  String get trackBranchPhone => 'هاتف المطعم';

  @override
  String get trackPayment => 'الدفع';

  @override
  String get payStatusCodPending => 'الدفع عند الاستلام';

  @override
  String get payStatusCodCollected => 'تم تحصيل المبلغ';

  @override
  String get payStatusUnpaid => 'غير مدفوع';

  @override
  String get payStatusPaid => 'مدفوع';

  @override
  String get payStatusRefunded => 'تم الاسترداد';

  @override
  String get trackLoadFailed => 'تعذّر تحميل هذا الطلب.';

  @override
  String get trackBackToMenu => 'العودة إلى القائمة';

  @override
  String trackPlacedAt(String date) {
    return 'تاريخ الطلب: $date';
  }

  @override
  String get ordersTitle => 'طلباتي';

  @override
  String get ordersEmpty => 'لم تقم بأي طلب بعد.';

  @override
  String get ordersSignInPrompt => 'سجّل الدخول لعرض طلباتك.';

  @override
  String get ordersLoadFailed => 'تعذّر تحميل طلباتك.';

  @override
  String get ordersReorder => 'اطلب مرة أخرى';

  @override
  String get ordersTrack => 'تتبّع';

  @override
  String ordersItemCount(int count) {
    return 'عدد الأصناف: $count';
  }

  @override
  String reorderAdded(int count) {
    return 'تمت إضافة $count صنف إلى سلتك';
  }

  @override
  String reorderDropped(int count) {
    return '$count صنف لم يعد متاحًا وتم استبعاده';
  }

  @override
  String get reorderNone => 'لا يوجد أي صنف من هذا الطلب متاح حاليًا.';
}

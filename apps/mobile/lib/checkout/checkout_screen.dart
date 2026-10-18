import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models/cart_models.dart';
import '../api/models/order_models.dart';
import '../auth/auth_notifier.dart';
import '../auth/login_screen.dart';
import '../cart/cart_notifier.dart';
import '../cart/cart_totals.dart';
import '../core/config.dart';
import '../l10n/l10n.dart';
import '../theme/common_widgets.dart';
import '../tracking/tracking_screen.dart';
import 'checkout_notifier.dart';
import 'validators.dart';

class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      ChangeNotifierProvider<CheckoutNotifier>(
        create: (ctx) =>
            CheckoutNotifier(ctx.read<ApiClient>(), ctx.read<CartNotifier>()),
        child: const _CheckoutView(),
      );
}

class _CheckoutView extends StatefulWidget {
  const _CheckoutView();

  @override
  State<_CheckoutView> createState() => _CheckoutViewState();
}

class _CheckoutViewState extends State<_CheckoutView> {
  final _formKey = GlobalKey<FormState>();
  final _landmark = TextEditingController();
  final _building = TextEditingController();
  final _floor = TextEditingController();
  final _apartment = TextEditingController();
  final _addressNotes = TextEditingController();
  final _note = TextEditingController();

  @override
  void dispose() {
    for (final c in [
      _landmark,
      _building,
      _floor,
      _apartment,
      _addressNotes,
      _note,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Address _address() => Address(
    landmark: _landmark.text,
    building: _building.text,
    floor: _floor.text,
    apartment: _apartment.text,
    notes: _addressNotes.text,
  );

  Future<void> _place() async {
    final cart = context.read<CartNotifier>();
    final checkout = context.read<CheckoutNotifier>();
    final auth = context.read<AuthNotifier>();
    final nav = Navigator.of(context);
    if (!_formKey.currentState!.validate()) return;
    final placed = await checkout.submit(
      address: cart.service == ServiceType.delivery ? _address() : null,
      note: _note.text,
    );
    if (!mounted) return;
    if (placed != null) {
      await nav.pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => TrackingScreen(trackingToken: placed.trackingToken),
        ),
        (route) => route.isFirst,
      );
      return;
    }
    final err = checkout.error;
    if (err != null && err.isUnauthorized) {
      await auth.onUnauthorized();
      if (!mounted) return;
      await nav.push(
        MaterialPageRoute<bool>(builder: (_) => const LoginScreen()),
      );
    } else if (err != null &&
        (err.code == 'INVALID_CART' || err.code == 'BELOW_MINIMUM')) {
      await cart.priceNow();
    }
  }

  String? _landmarkError(String? v) {
    final l = context.l10n;
    return switch (validateLandmark(v)) {
      LandmarkProblem.empty => l.checkoutLandmarkEmpty,
      LandmarkProblem.tooShort => l.checkoutLandmarkShort,
      LandmarkProblem.tooLong => l.checkoutLandmarkLong,
      null => null,
    };
  }

  String? _limit(String? v) =>
      isWithinLimit(v) ? null : context.l10n.checkoutFieldTooLong;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cart = context.watch<CartNotifier>();
    final checkout = context.watch<CheckoutNotifier>();
    final phone = context.watch<AuthNotifier>().phone;
    final delivery = cart.service == ServiceType.delivery;
    return Scaffold(
      appBar: AppBar(title: Text(l.checkoutTitle)),
      body: ContentWidth(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (delivery) ...[
                Text(
                  l.checkoutAddressTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  key: const Key('landmark'),
                  controller: _landmark,
                  decoration: InputDecoration(
                    labelText: l.checkoutLandmark,
                    hintText: l.checkoutLandmarkHint,
                  ),
                  validator: _landmarkError,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _building,
                  decoration: InputDecoration(labelText: l.checkoutBuilding),
                  validator: _limit,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _floor,
                        decoration: InputDecoration(labelText: l.checkoutFloor),
                        validator: _limit,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextFormField(
                        controller: _apartment,
                        decoration: InputDecoration(
                          labelText: l.checkoutApartment,
                        ),
                        validator: _limit,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _addressNotes,
                  decoration: InputDecoration(
                    labelText: l.checkoutAddressNotes,
                  ),
                  validator: _limit,
                ),
                const SizedBox(height: 16),
              ] else
                Text(l.cartPickupFrom),
              TextFormField(
                key: const Key('order-note'),
                controller: _note,
                decoration: InputDecoration(labelText: l.checkoutOrderNote),
                validator: _limit,
              ),
              if (phone != null) ...[
                const SizedBox(height: 8),
                Text(l.checkoutPhone(phone), textDirection: TextDirection.ltr),
              ],
              const SizedBox(height: 16),
              _PaymentChoice(checkout: checkout),
              const SizedBox(height: 16),
              Text(
                l.checkoutSummary,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              CartTotals(cart: cart),
              if (checkout.problem == CheckoutProblem.missingLocation)
                _Banner(l.checkoutNeedLocation),
              if (checkout.error != null)
                _Banner(
                  apiErrorMessage(l, checkout.error!),
                  key: const Key('checkout-error'),
                ),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('place-order'),
                onPressed: checkout.submitting ? null : _place,
                child: Text(
                  checkout.submitting ? l.checkoutPlacing : l.checkoutPlace,
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentChoice extends StatelessWidget {
  const _PaymentChoice({required this.checkout});
  final CheckoutNotifier checkout;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l.checkoutPaymentTitle,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        RadioGroup<PaymentMethod>(
          groupValue: checkout.method,
          onChanged: (m) {
            if (m != null) checkout.setMethod(m);
          },
          child: Column(
            children: [
              RadioListTile<PaymentMethod>(
                key: const Key('pay-cod'),
                value: PaymentMethod.cod,
                title: Text(l.payCod),
                secondary: const Icon(Icons.payments_outlined),
              ),
              RadioListTile<PaymentMethod>(
                key: const Key('pay-online'),
                value: PaymentMethod.online,
                enabled: kOnlinePaymentEnabled,
                title: Text(l.payOnline),
                subtitle: kOnlinePaymentEnabled
                    ? null
                    : Text(l.payOnlineUnavailable),
                secondary: const Icon(Icons.credit_card),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.error;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.08),
            border: Border.all(color: color),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.error_outline, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(text, style: TextStyle(color: color)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

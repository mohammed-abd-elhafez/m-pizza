import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'api/api_client.dart';
import 'auth/auth_notifier.dart';
import 'auth/session_store.dart';
import 'cart/cart_notifier.dart';
import 'checkout/location.dart';
import 'home_shell.dart';
import 'l10n/gen/app_localizations.dart';
import 'l10n/locale_notifier.dart';
import 'menu/menu_notifier.dart';
import 'orders/orders_notifier.dart';
import 'theme/app_theme.dart';

/// Root widget. All collaborators are injected so tests can fake them.
class MPizzaApp extends StatelessWidget {
  const MPizzaApp({
    super.key,
    required this.api,
    required this.sessionStore,
    required this.locationProvider,
    this.localeNotifier,
    this.priceDebounce,
    this.showDemoBanner = false,
  });

  final ApiClient api;
  final SessionStore sessionStore;
  final LocationProvider locationProvider;
  final LocaleNotifier? localeNotifier;
  final Duration? priceDebounce;

  /// Shows a notice that this is a demo (no real orders) above every screen.
  final bool showDemoBanner;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: api),
        Provider<LocationProvider>.value(value: locationProvider),
        ChangeNotifierProvider<LocaleNotifier>(
          create: (_) => localeNotifier ?? (LocaleNotifier()..restore()),
        ),
        ChangeNotifierProvider<AuthNotifier>(
          create: (_) => AuthNotifier(api, sessionStore)..restore(),
        ),
        ChangeNotifierProvider<MenuNotifier>(create: (_) => MenuNotifier(api)),
        ChangeNotifierProvider<CartNotifier>(
          create: (_) => priceDebounce == null
              ? CartNotifier(api)
              : CartNotifier(api, debounce: priceDebounce!),
        ),
        ChangeNotifierProvider<OrdersNotifier>(
          create: (_) => OrdersNotifier(api),
        ),
      ],
      child: Consumer<LocaleNotifier>(
        builder: (context, locale, _) => MaterialApp(
          onGenerateTitle: (ctx) => AppLocalizations.of(ctx).appTitle,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          locale: locale.locale,
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          builder: (context, child) => showDemoBanner
              ? Column(
                  children: [
                    Material(
                      color: Theme.of(context).colorScheme.tertiaryContainer,
                      child: SafeArea(
                        bottom: false,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          child: Text(
                            AppLocalizations.of(context).demoBanner,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                        ),
                      ),
                    ),
                    Expanded(child: child ?? const SizedBox.shrink()),
                  ],
                )
              : child ?? const SizedBox.shrink(),
          home: const HomeShell(),
        ),
      ),
    );
  }
}

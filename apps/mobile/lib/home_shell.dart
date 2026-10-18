import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth/auth_notifier.dart';
import 'auth/login_screen.dart';
import 'cart/cart_notifier.dart';
import 'cart/cart_screen.dart';
import 'l10n/l10n.dart';
import 'l10n/locale_notifier.dart';
import 'menu/menu_notifier.dart';
import 'menu/menu_screen.dart';
import 'orders/orders_screen.dart';

/// App frame: menu / cart / orders tabs, language toggle and account menu.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    final menu = context.read<MenuNotifier>();
    if (menu.status == LoadStatus.idle) {
      WidgetsBinding.instance.addPostFrameCallback((_) => menu.load());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final cart = context.watch<CartNotifier>();
    final pages = <Widget>[
      const MenuScreen(),
      CartScreen(onBrowse: () => setState(() => _index = 0)),
      OrdersScreen(onReordered: () => setState(() => _index = 1)),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(l.appTitle),
        actions: [
          Tooltip(
            message: l.languageTooltip,
            child: TextButton(
              key: const Key('lang-toggle'),
              onPressed: context.read<LocaleNotifier>().toggle,
              child: Text(
                l.switchLanguageLabel,
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ),
          const _AccountButton(),
        ],
      ),
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.local_pizza_outlined),
            selectedIcon: const Icon(Icons.local_pizza),
            label: l.navMenu,
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: cart.itemCount > 0,
              label: Text('${cart.itemCount}'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            selectedIcon: const Icon(Icons.shopping_cart),
            label: l.navCart,
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long),
            label: l.navOrders,
          ),
        ],
      ),
    );
  }
}

class _AccountButton extends StatelessWidget {
  const _AccountButton();

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final auth = context.watch<AuthNotifier>();
    if (!auth.isLoggedIn) {
      return IconButton(
        key: const Key('sign-in'),
        tooltip: l.accountSignIn,
        icon: const Icon(Icons.person_outline),
        onPressed: () => Navigator.of(context)
            .push(MaterialPageRoute<bool>(builder: (_) => const LoginScreen())),
      );
    }
    return PopupMenuButton<String>(
      key: const Key('account-menu'),
      tooltip: l.accountSignedInAs(auth.phone ?? ''),
      icon: const Icon(Icons.account_circle),
      onSelected: (_) => auth.logout(),
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Text(
            l.accountSignedInAs(auth.phone ?? ''),
            textDirection: TextDirection.ltr,
          ),
        ),
        PopupMenuItem<String>(value: 'logout', child: Text(l.accountSignOut)),
      ],
    );
  }
}

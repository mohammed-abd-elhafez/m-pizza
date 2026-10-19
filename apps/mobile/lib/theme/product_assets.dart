import 'package:flutter/material.dart';

/// Local visual assets keep the public demo usable without a backend or remote image host.
class ProductAssets {
  const ProductAssets._();

  static const logoMark = 'assets/brand/mpizza-mark.png';
  static const heroPizza = 'assets/food/hero-pizza.jpg';

  static String? forItem(int id) => switch (id) {
    1 => 'assets/food/margherita.jpg',
    2 => 'assets/food/pepperoni.jpg',
    3 => heroPizza,
    4 => 'assets/food/pepperoni.jpg',
    5 => 'assets/food/veggie.jpg',
    6 => 'assets/food/fries.jpg',
    7 => 'assets/food/mozzarella-sticks.jpg',
    8 => 'assets/food/garlic-bread.jpg',
    9 => 'assets/food/cola.jpg',
    10 => 'assets/food/orange-soda.jpg',
    11 => 'assets/food/water.jpg',
    12 => 'assets/food/brownie.jpg',
    _ => null,
  };

  static Widget imageOrFallback({
    required BuildContext context,
    required int itemId,
    required Widget fallback,
    double? width,
    double? height,
    BoxFit fit = BoxFit.cover,
  }) {
    final path = forItem(itemId);
    if (path == null) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Image.asset(
        path,
        width: width,
        height: height,
        fit: fit,
        errorBuilder: (_, _, _) => fallback,
      ),
    );
  }
}

import 'json_utils.dart';

class MenuSize {
  const MenuSize({
    required this.id,
    required this.label,
    required this.pricePiastres,
  });

  factory MenuSize.fromJson(Object? json) {
    final m = asMap(json, 'size');
    return MenuSize(
      id: asInt(m['id']),
      label: asString(m['label']),
      pricePiastres: asInt(m['pricePiastres']),
    );
  }

  final int id;
  final String label;
  final int pricePiastres;
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.kind,
    required this.nameAr,
    required this.nameEn,
    required this.descriptionAr,
    required this.descriptionEn,
    required this.imageUrl,
    required this.sizes,
  });

  factory MenuItem.fromJson(Object? json) {
    final m = asMap(json, 'item');
    return MenuItem(
      id: asInt(m['id']),
      kind: asString(m['kind']),
      nameAr: asString(m['nameAr']),
      nameEn: asString(m['nameEn']),
      descriptionAr: m['descriptionAr'] as String? ?? '',
      descriptionEn: m['descriptionEn'] as String? ?? '',
      imageUrl: optString(m['imageUrl']),
      sizes: asList(m['sizes']).map(MenuSize.fromJson).toList(growable: false),
    );
  }

  final int id;
  final String kind;
  final String nameAr;
  final String nameEn;
  final String descriptionAr;
  final String descriptionEn;
  final String? imageUrl;
  final List<MenuSize> sizes;

  bool get isPizza => kind == 'pizza';

  /// An item with no purchasable size cannot be ordered.
  bool get isAvailable => sizes.isNotEmpty;

  int? get fromPricePiastres => sizes.isEmpty
      ? null
      : sizes.map((s) => s.pricePiastres).reduce((a, b) => a < b ? a : b);

  String name(String lang) => pickLang(lang, nameAr, nameEn);
  String description(String lang) =>
      pickLang(lang, descriptionAr, descriptionEn);

  MenuSize? sizeById(int id) {
    for (final s in sizes) {
      if (s.id == id) return s;
    }
    return null;
  }

  MenuSize? sizeByLabel(String label) {
    for (final s in sizes) {
      if (s.label == label) return s;
    }
    return null;
  }
}

/// A crust or a topping: a named option with a price delta.
class MenuOption {
  const MenuOption({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.priceDeltaPiastres,
  });

  factory MenuOption.fromJson(Object? json) {
    final m = asMap(json, 'option');
    return MenuOption(
      id: asInt(m['id']),
      nameAr: asString(m['nameAr']),
      nameEn: asString(m['nameEn']),
      priceDeltaPiastres: asInt(m['priceDeltaPiastres']),
    );
  }

  final int id;
  final String nameAr;
  final String nameEn;
  final int priceDeltaPiastres;

  String name(String lang) => pickLang(lang, nameAr, nameEn);
}

class MenuCategory {
  const MenuCategory({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.items,
  });

  factory MenuCategory.fromJson(Object? json) {
    final m = asMap(json, 'category');
    return MenuCategory(
      id: asInt(m['id']),
      nameAr: asString(m['nameAr']),
      nameEn: asString(m['nameEn']),
      items: asList(m['items']).map(MenuItem.fromJson).toList(growable: false),
    );
  }

  final int id;
  final String nameAr;
  final String nameEn;
  final List<MenuItem> items;

  String name(String lang) => pickLang(lang, nameAr, nameEn);
}

class Menu {
  Menu({
    required this.categories,
    required this.crusts,
    required this.toppings,
  }) {
    for (final c in categories) {
      for (final i in c.items) {
        _items[i.id] = i;
      }
    }
    for (final c in crusts) {
      _crusts[c.id] = c;
    }
    for (final t in toppings) {
      _toppings[t.id] = t;
    }
  }

  factory Menu.fromJson(Object? json) {
    final m = asMap(json, 'menu');
    return Menu(
      categories: asList(m['categories'])
          .map(MenuCategory.fromJson)
          .toList(growable: false),
      crusts: asList(m['crusts'])
          .map(MenuOption.fromJson)
          .toList(growable: false),
      toppings: asList(m['toppings'])
          .map(MenuOption.fromJson)
          .toList(growable: false),
    );
  }

  final List<MenuCategory> categories;
  final List<MenuOption> crusts;
  final List<MenuOption> toppings;

  final Map<int, MenuItem> _items = {};
  final Map<int, MenuOption> _crusts = {};
  final Map<int, MenuOption> _toppings = {};

  MenuItem? itemById(int id) => _items[id];
  MenuOption? crustById(int id) => _crusts[id];
  MenuOption? toppingById(int id) => _toppings[id];

  /// All pizza items that can be ordered at [sizeLabel].
  List<MenuItem> pizzasWithSize(String sizeLabel) => [
    for (final i in _items.values)
      if (i.isPizza && i.sizeByLabel(sizeLabel) != null) i,
  ];

  bool get isEmpty => categories.every((c) => c.items.isEmpty);
}

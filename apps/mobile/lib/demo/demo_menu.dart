/// The menu served in demo mode. Mirrors the shape of the real `GET /menu` response, with demo prices
/// (integer piastres). Item `i` has sizes `i1`/`i2`/`i3` (S/M/L) so ids are easy to reason about.
Map<String, dynamic> _pizza(int id, String ar, String en, String descAr, String descEn, int s, int m, int l) => {
  'id': id,
  'kind': 'pizza',
  'nameAr': ar,
  'nameEn': en,
  'descriptionAr': descAr,
  'descriptionEn': descEn,
  'imageUrl': null,
  'sizes': [
    {'id': id * 10 + 1, 'label': 'S', 'pricePiastres': s},
    {'id': id * 10 + 2, 'label': 'M', 'pricePiastres': m},
    {'id': id * 10 + 3, 'label': 'L', 'pricePiastres': l},
  ],
};

Map<String, dynamic> _single(int id, String kind, String ar, String en, String? descAr, String? descEn, int price) => {
  'id': id,
  'kind': kind,
  'nameAr': ar,
  'nameEn': en,
  'descriptionAr': descAr,
  'descriptionEn': descEn,
  'imageUrl': null,
  'sizes': [
    {'id': id * 10 + 1, 'label': 'regular', 'pricePiastres': price},
  ],
};

final Map<String, dynamic> demoMenuJson = {
  'categories': [
    {
      'id': 1,
      'nameAr': 'بيتزا',
      'nameEn': 'Pizza',
      'items': [
        _pizza(1, 'مارجريتا', 'Margherita', 'صلصة طماطم وجبنة موتزاريلا', 'Tomato sauce and mozzarella', 8500, 11500, 14500),
        _pizza(2, 'بيبروني', 'Pepperoni', 'بيبروني وجبنة موتزاريلا', 'Pepperoni and mozzarella', 9500, 12500, 15500),
        _pizza(3, 'سوبريم', 'Supreme', 'بيبروني ومشروم وفلفل رومي وزيتون', 'Pepperoni, mushrooms, peppers and olives', 10500, 13500, 16500),
        _pizza(4, 'دجاج رانش', 'Chicken Ranch', 'دجاج وصوص رانش وذرة', 'Chicken, ranch sauce and corn', 10000, 13000, 16000),
        _pizza(5, 'خضروات', 'Veggie', 'مشروم وزيتون وفلفل رومي وذرة', 'Mushrooms, olives, peppers and corn', 8500, 11500, 14500),
      ],
    },
    {
      'id': 2,
      'nameAr': 'مقبلات',
      'nameEn': 'Sides',
      'items': [
        _single(6, 'side', 'بطاطس مقرمشة', 'Crispy Fries', null, null, 4000),
        _single(7, 'side', 'أصابع موتزاريلا', 'Mozzarella Sticks', null, null, 5500),
        _single(8, 'side', 'خبز بالثوم', 'Garlic Bread', null, null, 4500),
      ],
    },
    {
      'id': 3,
      'nameAr': 'مشروبات',
      'nameEn': 'Drinks',
      'items': [
        _single(9, 'drink', 'بيبسي', 'Pepsi', '330 مل', '330 ml', 1500),
        _single(10, 'drink', 'ميراندا', 'Mirinda', '330 مل', '330 ml', 1500),
        _single(11, 'drink', 'مياه', 'Water', null, null, 700),
      ],
    },
    {
      'id': 4,
      'nameAr': 'حلويات',
      'nameEn': 'Desserts',
      'items': [
        _single(12, 'dessert', 'براوني', 'Brownie', null, null, 3500),
      ],
    },
  ],
  'crusts': [
    {'id': 1, 'nameAr': 'كلاسيك', 'nameEn': 'Classic', 'priceDeltaPiastres': 0},
    {'id': 2, 'nameAr': 'رفيع', 'nameEn': 'Thin', 'priceDeltaPiastres': 0},
    {'id': 3, 'nameAr': 'محشي جبنة', 'nameEn': 'Cheese-stuffed', 'priceDeltaPiastres': 2500},
  ],
  'toppings': [
    {'id': 1, 'nameAr': 'جبنة إضافية', 'nameEn': 'Extra cheese', 'priceDeltaPiastres': 1500},
    {'id': 2, 'nameAr': 'مشروم', 'nameEn': 'Mushrooms', 'priceDeltaPiastres': 1000},
    {'id': 3, 'nameAr': 'زيتون', 'nameEn': 'Olives', 'priceDeltaPiastres': 800},
    {'id': 4, 'nameAr': 'بيبروني', 'nameEn': 'Pepperoni', 'priceDeltaPiastres': 1800},
    {'id': 5, 'nameAr': 'فلفل رومي', 'nameEn': 'Bell pepper', 'priceDeltaPiastres': 800},
    {'id': 6, 'nameAr': 'دجاج', 'nameEn': 'Chicken', 'priceDeltaPiastres': 1800},
    {'id': 7, 'nameAr': 'ذرة', 'nameEn': 'Corn', 'priceDeltaPiastres': 600},
  ],
};

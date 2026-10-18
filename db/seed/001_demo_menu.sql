-- Demo data for M Pizza. Prices are integer piastres (1 EGP = 100). Replace with the real menu before launch.
BEGIN;

INSERT INTO categories (id, name_ar, name_en, sort_order) VALUES
  (1, 'بيتزا', 'Pizza', 1),
  (2, 'مقبلات', 'Sides', 2),
  (3, 'مشروبات', 'Drinks', 3),
  (4, 'حلويات', 'Desserts', 4);

INSERT INTO items (id, category_id, name_ar, name_en, description_ar, description_en, kind) VALUES
  (1, 1, 'مارجريتا', 'Margherita', 'صلصة طماطم وجبنة موتزاريلا', 'Tomato sauce and mozzarella', 'pizza'),
  (2, 1, 'بيبروني', 'Pepperoni', 'بيبروني وجبنة موتزاريلا', 'Pepperoni and mozzarella', 'pizza'),
  (3, 1, 'سوبريم', 'Supreme', 'بيبروني ومشروم وفلفل رومي وزيتون', 'Pepperoni, mushrooms, peppers and olives', 'pizza'),
  (4, 1, 'دجاج رانش', 'Chicken Ranch', 'دجاج وصوص رانش وذرة', 'Chicken, ranch sauce and corn', 'pizza'),
  (5, 1, 'خضروات', 'Veggie', 'مشروم وزيتون وفلفل رومي وذرة', 'Mushrooms, olives, peppers and corn', 'pizza'),
  (6, 2, 'بطاطس مقرمشة', 'Crispy Fries', NULL, NULL, 'side'),
  (7, 2, 'أصابع موتزاريلا', 'Mozzarella Sticks', NULL, NULL, 'side'),
  (8, 2, 'خبز بالثوم', 'Garlic Bread', NULL, NULL, 'side'),
  (9, 3, 'بيبسي', 'Pepsi', '330 مل', '330 ml', 'drink'),
  (10, 3, 'ميراندا', 'Mirinda', '330 مل', '330 ml', 'drink'),
  (11, 3, 'مياه', 'Water', NULL, NULL, 'drink'),
  (12, 4, 'براوني', 'Brownie', NULL, NULL, 'dessert');

INSERT INTO item_sizes (item_id, label, price_piastres) VALUES
  (1, 'S', 8500), (1, 'M', 11500), (1, 'L', 14500),
  (2, 'S', 9500), (2, 'M', 12500), (2, 'L', 15500),
  (3, 'S', 10500), (3, 'M', 13500), (3, 'L', 16500),
  (4, 'S', 10000), (4, 'M', 13000), (4, 'L', 16000),
  (5, 'S', 8500), (5, 'M', 11500), (5, 'L', 14500),
  (6, 'regular', 4000), (7, 'regular', 5500), (8, 'regular', 4500),
  (9, 'regular', 1500), (10, 'regular', 1500), (11, 'regular', 700),
  (12, 'regular', 3500);

INSERT INTO crusts (id, name_ar, name_en, price_delta_piastres) VALUES
  (1, 'كلاسيك', 'Classic', 0),
  (2, 'رفيع', 'Thin', 0),
  (3, 'محشي جبنة', 'Cheese-stuffed', 2500);

INSERT INTO toppings (id, name_ar, name_en, price_delta_piastres) VALUES
  (1, 'جبنة إضافية', 'Extra cheese', 1500),
  (2, 'مشروم', 'Mushrooms', 1000),
  (3, 'زيتون', 'Olives', 800),
  (4, 'بيبروني', 'Pepperoni', 1800),
  (5, 'فلفل رومي', 'Bell pepper', 800),
  (6, 'دجاج', 'Chicken', 1800),
  (7, 'ذرة', 'Corn', 600);

INSERT INTO item_default_toppings (item_id, topping_id) VALUES
  (2, 4), (3, 4), (3, 2), (3, 5), (3, 3), (4, 6), (4, 7), (5, 2), (5, 3), (5, 5), (5, 7);

INSERT INTO branches (id, name_ar, name_en, phone, lat, lng) VALUES
  (1, 'فرع وسط البلد', 'Downtown Branch', NULL, 30.0444, 31.2357);

INSERT INTO delivery_zones (branch_id, name, radius_m, fee_piastres, min_order_piastres, eta_minutes) VALUES
  (1, 'قريب', 3000, 1500, 8000, 30),
  (1, 'بعيد', 6000, 3000, 12000, 45);

SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT max(id) FROM categories));
SELECT setval(pg_get_serial_sequence('items', 'id'), (SELECT max(id) FROM items));
SELECT setval(pg_get_serial_sequence('crusts', 'id'), (SELECT max(id) FROM crusts));
SELECT setval(pg_get_serial_sequence('toppings', 'id'), (SELECT max(id) FROM toppings));
SELECT setval(pg_get_serial_sequence('branches', 'id'), (SELECT max(id) FROM branches));

COMMIT;

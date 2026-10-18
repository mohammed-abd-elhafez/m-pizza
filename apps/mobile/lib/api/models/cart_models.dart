import 'json_utils.dart';

enum ServiceType {
  delivery,
  pickup;

  static ServiceType parse(String v) =>
      v == 'pickup' ? ServiceType.pickup : ServiceType.delivery;
}

enum HalfSide { whole, left, right }

enum ToppingAction { add, remove }

class GeoPoint {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  bool get isValid => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};

  @override
  bool operator ==(Object other) =>
      other is GeoPoint && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);
}

class ToppingChange {
  const ToppingChange(this.id, this.action);

  factory ToppingChange.fromJson(Object? json) {
    final m = asMap(json, 'topping');
    final action = asString(m['action']);
    return ToppingChange(
      asInt(m['id']),
      action == 'remove' ? ToppingAction.remove : ToppingAction.add,
    );
  }

  final int id;
  final ToppingAction action;

  Map<String, dynamic> toJson() => {'id': id, 'action': action.name};

  @override
  bool operator ==(Object other) =>
      other is ToppingChange && other.id == id && other.action == action;

  @override
  int get hashCode => Object.hash(id, action);
}

class PizzaHalf {
  const PizzaHalf({
    required this.side,
    required this.itemId,
    required this.sizeId,
    this.toppings = const [],
  });

  factory PizzaHalf.fromJson(Object? json) {
    final m = asMap(json, 'half');
    final side = asString(m['half']);
    return PizzaHalf(
      side: HalfSide.values.firstWhere(
        (s) => s.name == side,
        orElse: () => throw const FormatException('Unknown half'),
      ),
      itemId: asInt(m['itemId']),
      sizeId: asInt(m['sizeId']),
      toppings: m['toppings'] == null
          ? const []
          : asList(m['toppings'])
                .map(ToppingChange.fromJson)
                .toList(growable: false),
    );
  }

  final HalfSide side;
  final int itemId;
  final int sizeId;
  final List<ToppingChange> toppings;

  Map<String, dynamic> toJson() => {
    'half': side.name,
    'itemId': itemId,
    'sizeId': sizeId,
    'toppings': [for (final t in toppings) t.toJson()],
  };
}

class CartLine {
  const CartLine({
    required this.qty,
    required this.halves,
    this.crustId,
    this.note,
  });

  factory CartLine.fromJson(Object? json) {
    final m = asMap(json, 'line');
    final halves = asList(m['halves'])
        .map(PizzaHalf.fromJson)
        .toList(growable: false);
    if (halves.isEmpty || halves.length > 2) {
      throw const FormatException('A line needs one or two halves');
    }
    return CartLine(
      qty: asInt(m['qty']),
      crustId: m['crustId'] == null ? null : asInt(m['crustId']),
      note: optString(m['note']),
      halves: halves,
    );
  }

  final int qty;
  final int? crustId;
  final String? note;
  final List<PizzaHalf> halves;

  bool get isHalfAndHalf => halves.length == 2;

  CartLine withQty(int value) =>
      CartLine(qty: value, halves: halves, crustId: crustId, note: note);

  Map<String, dynamic> toJson() => {
    'qty': qty,
    if (crustId != null) 'crustId': crustId,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
    'halves': [for (final h in halves) h.toJson()],
  };
}

/// The body of `POST /cart/price` (and the cart part of `POST /orders`).
class CartRequest {
  const CartRequest({
    required this.service,
    required this.lines,
    this.location,
    this.branchId,
  });

  final ServiceType service;
  final List<CartLine> lines;
  final GeoPoint? location;
  final int? branchId;

  Map<String, dynamic> toJson() => {
    'service': service.name,
    if (service == ServiceType.delivery && location != null)
      'location': location!.toJson(),
    if (service == ServiceType.pickup && branchId != null) 'branchId': branchId,
    'lines': [for (final l in lines) l.toJson()],
  };
}

class LineQuote {
  const LineQuote({required this.unitPiastres, required this.totalPiastres});

  factory LineQuote.fromJson(Object? json) {
    final m = asMap(json, 'line quote');
    return LineQuote(
      unitPiastres: asInt(m['unitPiastres']),
      totalPiastres: asInt(m['totalPiastres']),
    );
  }

  final int unitPiastres;
  final int totalPiastres;
}

class PriceQuote {
  const PriceQuote({
    required this.subtotalPiastres,
    required this.deliveryFeePiastres,
    required this.totalPiastres,
    required this.minOrderPiastres,
    required this.etaMinutes,
    required this.lines,
  });

  factory PriceQuote.fromJson(Object? json) {
    final m = asMap(json, 'quote');
    return PriceQuote(
      subtotalPiastres: asInt(m['subtotalPiastres']),
      deliveryFeePiastres: asInt(m['deliveryFeePiastres']),
      totalPiastres: asInt(m['totalPiastres']),
      minOrderPiastres: m['minOrderPiastres'] == null
          ? 0
          : asInt(m['minOrderPiastres']),
      etaMinutes: m['etaMinutes'] == null ? null : asInt(m['etaMinutes']),
      lines: asList(m['lines']).map(LineQuote.fromJson).toList(growable: false),
    );
  }

  final int subtotalPiastres;
  final int deliveryFeePiastres;
  final int totalPiastres;
  final int minOrderPiastres;
  final int? etaMinutes;
  final List<LineQuote> lines;

  bool get belowMinimum => subtotalPiastres < minOrderPiastres;
}

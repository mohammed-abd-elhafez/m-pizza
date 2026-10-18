import 'cart_models.dart';
import 'json_utils.dart';

enum OrderStatus {
  placed('PLACED'),
  accepted('ACCEPTED'),
  preparing('PREPARING'),
  ready('READY'),
  outForDelivery('OUT_FOR_DELIVERY'),
  delivered('DELIVERED'),
  pickedUp('PICKED_UP'),
  cancelled('CANCELLED'),
  unknown('UNKNOWN');

  const OrderStatus(this.wire);

  final String wire;

  static OrderStatus parse(Object? v) {
    for (final s in values) {
      if (s.wire == v) return s;
    }
    return OrderStatus.unknown;
  }

  bool get isFinal =>
      this == delivered || this == pickedUp || this == cancelled;

  /// The happy-path timeline for a service type.
  static List<OrderStatus> timeline(ServiceType service) =>
      service == ServiceType.pickup
      ? const [placed, accepted, preparing, ready, pickedUp]
      : const [placed, accepted, preparing, ready, outForDelivery, delivered];
}

enum PaymentMethod { cod, online }

class Address {
  const Address({
    required this.landmark,
    this.building,
    this.floor,
    this.apartment,
    this.notes,
  });

  final String landmark;
  final String? building;
  final String? floor;
  final String? apartment;
  final String? notes;

  Map<String, dynamic> toJson() {
    String? clean(String? s) {
      final t = s?.trim();
      return t == null || t.isEmpty ? null : t;
    }

    return {
      'landmark': landmark.trim(),
      if (clean(building) != null) 'building': clean(building),
      if (clean(floor) != null) 'floor': clean(floor),
      if (clean(apartment) != null) 'apartment': clean(apartment),
      if (clean(notes) != null) 'notes': clean(notes),
    };
  }
}

class Session {
  const Session({
    required this.token,
    required this.expiresAt,
    required this.phone,
  });

  factory Session.fromJson(Object? json) {
    final m = asMap(json, 'session');
    return Session(
      token: asString(m['token']),
      expiresAt: DateTime.parse(asString(m['expiresAt'])),
      phone: asString(m['phone']),
    );
  }

  final String token;
  final DateTime expiresAt;
  final String phone;

  bool isExpired(DateTime now) => !expiresAt.isAfter(now);
}

class PlacedOrder {
  const PlacedOrder({
    required this.trackingToken,
    required this.status,
    required this.paymentStatus,
    required this.totalPiastres,
    this.redirectUrl,
  });

  factory PlacedOrder.fromJson(Object? json) {
    final root = asMap(json, 'response');
    final o = asMap(root['order'], 'order');
    final payment = root['payment'];
    return PlacedOrder(
      trackingToken: asString(o['trackingToken']),
      status: OrderStatus.parse(o['status']),
      paymentStatus: asString(o['paymentStatus']),
      totalPiastres: asInt(o['totalPiastres']),
      redirectUrl: payment == null
          ? null
          : optString(asMap(payment)['redirectUrl']),
    );
  }

  final String trackingToken;
  final OrderStatus status;
  final String paymentStatus;
  final int totalPiastres;
  final String? redirectUrl;
}

class OrderSummary {
  const OrderSummary({
    required this.trackingToken,
    required this.status,
    required this.paymentStatus,
    required this.service,
    required this.totalPiastres,
    required this.createdAt,
    required this.lines,
  });

  factory OrderSummary.fromJson(Object? json) {
    final m = asMap(json, 'order');
    return OrderSummary(
      trackingToken: asString(m['trackingToken']),
      status: OrderStatus.parse(m['status']),
      paymentStatus: asString(m['paymentStatus']),
      service: ServiceType.parse(asString(m['service'])),
      totalPiastres: asInt(m['totalPiastres']),
      createdAt: DateTime.parse(asString(m['createdAt'])),
      lines: asList(m['lines']).map(CartLine.fromJson).toList(growable: false),
    );
  }

  final String trackingToken;
  final OrderStatus status;
  final String paymentStatus;
  final ServiceType service;
  final int totalPiastres;
  final DateTime createdAt;
  final List<CartLine> lines;
}

class TrackedOrder {
  const TrackedOrder({
    required this.trackingToken,
    required this.status,
    required this.paymentStatus,
    required this.service,
    required this.totalPiastres,
    required this.subtotalPiastres,
    required this.deliveryFeePiastres,
    required this.createdAt,
    this.branchPhone,
  });

  factory TrackedOrder.fromJson(Object? json) {
    final m = asMap(asMap(json, 'response')['order'], 'order');
    return TrackedOrder(
      trackingToken: asString(m['trackingToken']),
      status: OrderStatus.parse(m['status']),
      paymentStatus: asString(m['paymentStatus']),
      service: ServiceType.parse(asString(m['service'])),
      totalPiastres: asInt(m['totalPiastres']),
      subtotalPiastres: asInt(m['subtotalPiastres']),
      deliveryFeePiastres: asInt(m['deliveryFeePiastres']),
      branchPhone: optString(m['branchPhone']),
      createdAt: DateTime.parse(asString(m['createdAt'])),
    );
  }

  final String trackingToken;
  final OrderStatus status;
  final String paymentStatus;
  final ServiceType service;
  final int totalPiastres;
  final int subtotalPiastres;
  final int deliveryFeePiastres;
  final String? branchPhone;
  final DateTime createdAt;

  TrackedOrder withStatus(OrderStatus s, String payment) => TrackedOrder(
    trackingToken: trackingToken,
    status: s,
    paymentStatus: payment,
    service: service,
    totalPiastres: totalPiastres,
    subtotalPiastres: subtotalPiastres,
    deliveryFeePiastres: deliveryFeePiastres,
    branchPhone: branchPhone,
    createdAt: createdAt,
  );
}

class StatusEvent {
  const StatusEvent({required this.status, required this.paymentStatus});

  /// Returns null for messages that are not status updates.
  static StatusEvent? tryParse(Object? json) {
    if (json is! Map || json['type'] != 'status') return null;
    return StatusEvent(
      status: OrderStatus.parse(json['status']),
      paymentStatus: json['paymentStatus'] as String? ?? '',
    );
  }

  final OrderStatus status;
  final String paymentStatus;
}

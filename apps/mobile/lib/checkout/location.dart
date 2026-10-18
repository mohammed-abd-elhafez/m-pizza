import 'package:geolocator/geolocator.dart';

import '../api/models/cart_models.dart';

enum LocationFailure { denied, disabled, unavailable }

class LocationException implements Exception {
  const LocationException(this.failure);
  final LocationFailure failure;
}

/// Source of the device position. Tests use a fake.
abstract class LocationProvider {
  Future<GeoPoint> current();
}

class GeolocatorLocationProvider implements LocationProvider {
  const GeolocatorLocationProvider();

  @override
  Future<GeoPoint> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const LocationException(LocationFailure.disabled);
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw const LocationException(LocationFailure.denied);
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      return GeoPoint(p.latitude, p.longitude);
    } on LocationException {
      rethrow;
    } catch (_) {
      throw const LocationException(LocationFailure.unavailable);
    }
  }
}

class PresetPoint {
  const PresetPoint(this.key, this.point);
  final String key;
  final GeoPoint point;
}

/// Preset points for the manual fallback. [key] maps to a localised name.
const List<PresetPoint> kLocationPresets = [
  PresetPoint('downtownCairo', GeoPoint(30.0444, 31.2357)),
  PresetPoint('nasrCity', GeoPoint(30.0626, 31.3219)),
  PresetPoint('giza', GeoPoint(30.0131, 31.2089)),
];

/// Parses user-typed coordinates (Arabic digits and comma decimals allowed).
GeoPoint? parseCoordinates(String lat, String lng) {
  double? one(String s) => double.tryParse(
    s
        .trim()
        .replaceAll(',', '.')
        .replaceAllMapped(
          RegExp('[\u0660-\u0669]'),
          (m) => String.fromCharCode(m[0]!.codeUnitAt(0) - 0x0660 + 0x30),
        ),
  );
  final a = one(lat);
  final b = one(lng);
  if (a == null || b == null) return null;
  final p = GeoPoint(a, b);
  return p.isValid ? p : null;
}

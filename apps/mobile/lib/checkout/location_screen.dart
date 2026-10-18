import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/cart_models.dart';
import '../cart/cart_notifier.dart';
import '../l10n/l10n.dart';
import '../theme/common_widgets.dart';
import 'location.dart';

/// Picks the delivery location: device position, preset, or typed lat/lng.
class LocationScreen extends StatefulWidget {
  const LocationScreen({super.key});

  @override
  State<LocationScreen> createState() => _LocationScreenState();
}

class _LocationScreenState extends State<LocationScreen> {
  late final TextEditingController _lat;
  late final TextEditingController _lng;
  bool _finding = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final current = context.read<CartNotifier>().location;
    _lat = TextEditingController(text: current?.lat.toString() ?? '');
    _lng = TextEditingController(text: current?.lng.toString() ?? '');
  }

  @override
  void dispose() {
    _lat.dispose();
    _lng.dispose();
    super.dispose();
  }

  void _fill(GeoPoint p) {
    setState(() {
      _lat.text = p.lat.toString();
      _lng.text = p.lng.toString();
      _message = null;
    });
  }

  Future<void> _useCurrent() async {
    final l = context.l10n;
    final provider = context.read<LocationProvider>();
    setState(() {
      _finding = true;
      _message = null;
    });
    try {
      final p = await provider.current();
      if (!mounted) return;
      _fill(p);
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() {
        _message = switch (e.failure) {
          LocationFailure.denied => l.locationDenied,
          LocationFailure.disabled => l.locationDisabled,
          LocationFailure.unavailable => l.locationUnavailable,
        };
      });
    } finally {
      if (mounted) setState(() => _finding = false);
    }
  }

  void _confirm() {
    final p = parseCoordinates(_lat.text, _lng.text);
    if (p == null) {
      setState(() => _message = context.l10n.locationInvalid);
      return;
    }
    context.read<CartNotifier>().setLocation(p);
    Navigator.of(context).pop(p);
  }

  String _presetName(String key) {
    final l = context.l10n;
    return switch (key) {
      'downtownCairo' => l.presetDowntownCairo,
      'nasrCity' => l.presetNasrCity,
      _ => l.presetGiza,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.locationTitle)),
      body: ContentWidth(
        maxWidth: 520,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            FilledButton.icon(
              key: const Key('use-current'),
              onPressed: _finding ? null : _useCurrent,
              icon: const Icon(Icons.my_location),
              label: Text(_finding ? l.locationFinding : l.locationUseCurrent),
            ),
            const SizedBox(height: 20),
            Text(
              l.locationPresets,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final p in kLocationPresets)
                  ActionChip(
                    key: Key('preset-${p.key}'),
                    label: Text(_presetName(p.key)),
                    onPressed: () => _fill(p.point),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              l.locationManualTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('lat'),
                    controller: _lat,
                    textDirection: TextDirection.ltr,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: InputDecoration(labelText: l.locationLat),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    key: const Key('lng'),
                    controller: _lng,
                    textDirection: TextDirection.ltr,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: InputDecoration(labelText: l.locationLng),
                  ),
                ),
              ],
            ),
            if (_message != null) ...[
              const SizedBox(height: 12),
              Semantics(
                liveRegion: true,
                child: Text(
                  _message!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            ],
            const SizedBox(height: 20),
            FilledButton(
              key: const Key('confirm-location'),
              onPressed: _confirm,
              child: Text(l.locationConfirm),
            ),
          ],
        ),
      ),
    );
  }
}

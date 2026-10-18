import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/models/menu_models.dart';

enum LoadStatus { idle, loading, ready, error }

class MenuNotifier extends ChangeNotifier {
  MenuNotifier(this._api);

  final ApiClient _api;
  LoadStatus _status = LoadStatus.idle;
  Menu? _menu;
  ApiException? _error;

  LoadStatus get status => _status;
  Menu? get menu => _menu;
  ApiException? get error => _error;

  Future<void> load() async {
    _status = LoadStatus.loading;
    _error = null;
    notifyListeners();
    try {
      _menu = await _api.getMenu();
      _status = LoadStatus.ready;
    } on ApiException catch (e) {
      _error = e;
      _status = LoadStatus.error;
    }
    notifyListeners();
  }
}

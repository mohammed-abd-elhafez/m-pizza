enum LandmarkProblem { empty, tooShort, tooLong }

/// Landmark must be 3-200 characters (server contract).
LandmarkProblem? validateLandmark(String? value) {
  final v = value?.trim() ?? '';
  if (v.isEmpty) return LandmarkProblem.empty;
  if (v.length < 3) return LandmarkProblem.tooShort;
  if (v.length > 200) return LandmarkProblem.tooLong;
  return null;
}

/// Optional free-text fields: the server caps them; we cap at 200.
bool isWithinLimit(String? value, [int max = 200]) =>
    (value?.trim().length ?? 0) <= max;

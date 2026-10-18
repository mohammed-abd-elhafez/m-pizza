# M Pizza customer app (Flutter)

Arabic-first (RTL) customer app for the M Pizza API (`docs/api.md`).

## Run (web, against a locally running API)

```powershell
$env:Path = "C:\dev\flutter\bin;C:\Program Files\Git\cmd;" + $env:Path
flutter pub get
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=http://127.0.0.1:3000
```

The API allows CORS from `http://localhost:8080` and `http://127.0.0.1:8080`. In development the OTP code is printed on the API console.

## Checks

```powershell
flutter analyze
flutter test --coverage
flutter build web
```

After editing `lib/l10n/*.arb` run `flutter gen-l10n` (output in `lib/l10n/gen`, committed).

## Layout

`lib/api` (client interface, HTTP/WebSocket implementation, models) - `auth` - `menu` (menu, customiser) - `cart` - `checkout` (checkout, location, payment redirect) - `tracking` - `orders` - `l10n` - `theme`. Configuration constants (API URL, default pickup branch id, online-payment flag) are in `lib/core/config.dart`.

## Release and security settings

- **`API_BASE_URL`** (`--dart-define`): release builds refuse to start unless it is an `https://` URL; debug builds may also use plain `http://` to `localhost`, `127.0.0.1` or the Android emulator host `10.0.2.2`. A release web build therefore needs `--dart-define=API_BASE_URL=https://...`; to try a local web build against a local API use `flutter build web --profile` (or `flutter run -d chrome`).
- **`PAYMENT_HOSTS`** (`--dart-define`, default `accept.paymob.com`): the hosted payment page is opened only if its URL is `https` on one of these hosts, so a tampered response cannot send customers to a look-alike site.
- **Session token**: stored in the Android Keystore / iOS Keychain via `flutter_secure_storage` on mobile; web falls back to `shared_preferences` because browsers have no secure storage.
- **Android**: the main manifest declares `INTERNET` (without it release builds cannot reach the API), disables cloud backup of app data and cleartext traffic; only the debug manifest allows cleartext for the emulator.
- Not done yet: certificate pinning, root/jailbreak detection and screenshot blocking (decide whether the risk warrants them), and an Android/iOS build and device test.

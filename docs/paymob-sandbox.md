# Paymob Sandbox Setup

M Pizza uses Paymob's current Egypt Intention API and Unified Checkout in `PAYMOB_MODE=intention`. This flow can expose multiple Test Integration IDs in one hosted checkout for the payment methods enabled on the merchant account. The legacy Classic Accept iframe flow remains available with `PAYMOB_MODE=classic` for existing accounts.

Paymob documents `https://accept.paymob.com` as the Egypt regional base URL and states that Test/Live mode is selected by the credentials and Integration IDs, not by switching to a different regional URL. [1]

## Required Test configuration

Copy `apps/api/.env.example` to `apps/api/.env.local` and set the following values from the Paymob Accept Dashboard in **Test** mode:

```dotenv
PAYMOB_MODE=intention
PAYMOB_BASE_URL=https://accept.paymob.com
PAYMOB_SECRET_KEY=sk_test_...
PAYMOB_PUBLIC_KEY=pk_test_...
PAYMOB_PAYMENT_METHOD_IDS=123456,123457
PAYMOB_HMAC_SECRET=...
PAYMOB_NOTIFICATION_URL=https://your-public-test-host.example/payments/webhook/paymob
PAYMOB_REDIRECTION_URL=https://your-public-test-host.example/payment-result
```

The API key, Secret Key, Public Key, HMAC Secret and Integration IDs are obtained from the Accept Dashboard. Paymob documents that the API key is shared between modes while Secret/Public keys and Integration IDs depend on the selected Test/Live mode. [2]

`PAYMOB_NOTIFICATION_URL` must be a public HTTPS endpoint. Paymob cannot POST a webhook to `localhost`, `127.0.0.1`, a LAN address or a VPN-only address. The callback route is:

```text
POST /payments/webhook/paymob?hmac=...
```

The application trusts payment state only after HMAC verification and server-side amount matching. Redirect query parameters are not trusted as proof of payment.

## Dashboard steps

1. Open the Paymob Accept Dashboard and switch the dashboard to **Test** mode.
2. From **Settings → API Keys**, copy the Test Secret Key, Public Key and HMAC Secret. The API Key can be used in the legacy Classic flow when needed.
3. From **Settings → Payment Integrations**, copy the Test Integration IDs for the card, wallet or other methods enabled for the merchant account.
4. Configure the Integration ID webhook URL and redirect URL when the dashboard flow requires integration-level callbacks. The application also sends the URLs in the Intention request.
5. Start the API behind a public HTTPS test host or a stable HTTPS tunnel and set `PAYMOB_NOTIFICATION_URL` to that route.
6. Run the local smoke command:

```bash
cd apps/api
npm run paymob:smoke
```

The command creates a small Test payment intention and prints a one-time Unified Checkout URL. It does not store the Paymob secret or write a real order. Open the URL manually and use Paymob's Test credentials only.

## Official Test payment data

Paymob's current Test Credentials page lists these card values:

- Mastercard: `5123456789012346`, expiry `01/39`, CVV `123`.
- Mastercard: `5123450000000008`, expiry `01/39`, CVV `123`.
- Visa: `4111111111111111`, expiry `01/39`, CVV `123`.
- Test wallet: `01010101010`, MPIN `123456`, OTP `123456`.

These values are for the Paymob Test environment only and must never be used as production card data. [3]

## Test matrix

Run the following cases before enabling online payments for customers:

1. Successful card payment: verify the hosted checkout opens, the callback HMAC is valid, the amount matches, the order becomes `PAID`, and a duplicate callback is harmless.
2. Failed card payment: verify the order remains unpaid and is not exposed to the kitchen.
3. Wallet payment: verify the wallet-specific OTP flow and the same signed callback path.
4. Multiple methods: configure at least two Test Integration IDs and confirm the Unified Checkout exposes only the enabled methods.
5. Customer cancellation/timeout: verify the order remains unpaid and is eventually cancelled by the expiry worker.
6. Forged callback: change one signed field or the HMAC and verify the API returns 401 without changing the order.
7. Amount mismatch: send a correctly signed callback for a different amount and verify the payment is not marked paid.
8. Replay: deliver the same valid callback twice and verify the second delivery is a no-op.

## Classic fallback

For an older account that still requires the iframe flow:

```dotenv
PAYMOB_MODE=classic
PAYMOB_API_KEY=...
PAYMOB_INTEGRATION_ID=123456
PAYMOB_IFRAME_ID=123456
PAYMOB_HMAC_SECRET=...
PAYMOB_BASE_URL=https://accept.paymob.com
```

Use Classic only when the merchant dashboard does not provide the Intention/Unified Checkout setup. The current official API overview recommends starting a payment with an Intention and then launching a hosted or embedded checkout. [1]

## References

[1]: https://developers.paymob.com/paymob-docs/integration-paths/apis "Paymob API integration paths"
[2]: https://developers.paymob.com/paymob-docs/need-help/setup-guides/getting-integration-credentials "Paymob getting integration credentials"
[3]: https://developers.paymob.com/paymob-docs/need-help/setup-guides/test-credentials "Paymob Test Credentials"
[4]: https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac "Paymob HMAC authentication"

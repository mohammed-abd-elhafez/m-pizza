import { randomUUID } from "node:crypto";
import { loadServerConfig } from "../src/config";
import { PaymobGateway } from "../src/infra/paymob";

const config = loadServerConfig();
if (!config.paymob) throw new Error("Paymob is not configured; copy .env.example and add Test credentials");
if (config.paymob.mode !== "intention") throw new Error("The smoke command requires PAYMOB_MODE=intention");

const amountPiastres = Number(process.env["PAYMOB_SMOKE_AMOUNT_PIASTRES"] ?? 100);
if (!Number.isInteger(amountPiastres) || amountPiastres <= 0) {
  throw new Error("PAYMOB_SMOKE_AMOUNT_PIASTRES must be a positive integer");
}

const phone = process.env["PAYMOB_SMOKE_PHONE"] ?? "+201010101010";
const merchantOrderId = `mpizza-smoke-${randomUUID()}`;
const checkout = await new PaymobGateway(config.paymob).createCheckout({
  amountPiastres,
  merchantOrderId,
  customerPhone: phone,
});

// The URL contains a single-use client secret. Print it only to the local terminal; never commit or log it in CI.
console.log(JSON.stringify({ merchantOrderId, amountPiastres, providerRef: checkout.providerRef, redirectUrl: checkout.redirectUrl }, null, 2));

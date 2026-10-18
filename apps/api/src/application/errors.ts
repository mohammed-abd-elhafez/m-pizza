export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CART"
  | "OUT_OF_ZONE"
  | "BELOW_MINIMUM"
  | "BRANCH_UNAVAILABLE"
  | "NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "PAYMENT_PENDING"
  | "RATE_LIMITED";

/** An expected, client-facing failure. Messages must be safe to return to callers. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

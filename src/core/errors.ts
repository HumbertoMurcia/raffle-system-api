/**
 * Every domain error carries a stable `code` and the HTTP `status` it maps to,
 * so the error-handling plugin never needs to know the individual classes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(resource: string, id: string) {
    super(`${resource} '${id}' was not found`, { resource, id });
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly status = 401;

  constructor(message = "Authentication is required") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message = "You are not allowed to perform this action") {
    super(message);
  }
}

/** A request that is well-formed but violates a business rule. */
export class BusinessRuleError extends DomainError {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status = 422,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
    this.code = code;
    this.status = status;
  }
}

export class RaffleNotActiveError extends BusinessRuleError {
  constructor(raffleId: string, status: string) {
    super(
      "RAFFLE_NOT_ACTIVE",
      `Raffle '${raffleId}' is not open for ticket sales (status: ${status})`,
      409,
      { raffleId, status },
    );
  }
}

export class RaffleDrawDatePassedError extends BusinessRuleError {
  constructor(raffleId: string, drawDate: Date) {
    super(
      "RAFFLE_DRAW_DATE_PASSED",
      `Raffle '${raffleId}' closed for sales at ${drawDate.toISOString()}`,
      409,
      { raffleId, drawDate: drawDate.toISOString() },
    );
  }
}

export class NotEnoughTicketsError extends BusinessRuleError {
  constructor(raffleId: string, requested: number, available: number) {
    super(
      "NOT_ENOUGH_TICKETS",
      `Raffle '${raffleId}' only has ${available} ticket(s) left, ${requested} requested`,
      409,
      { raffleId, requested, available },
    );
  }
}

export class InsufficientBalanceError extends BusinessRuleError {
  constructor(required: number, available: number) {
    super(
      "INSUFFICIENT_BALANCE",
      `Purchase costs ${required} but balance is ${available}`,
      402,
      { required, available },
    );
  }
}

export class InvalidPurchaseQuantityError extends BusinessRuleError {
  constructor(quantity: number, max: number) {
    super(
      "INVALID_QUANTITY",
      `Quantity must be between 1 and ${max}, received ${quantity}`,
      400,
      { quantity, max },
    );
  }
}

export class IdempotencyKeyConflictError extends BusinessRuleError {
  constructor(key: string) {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      `Idempotency key '${key}' was already used for a different request`,
      409,
      { idempotencyKey: key },
    );
  }
}

import { Elysia, t, ValidationError } from "elysia";
import { createProvider } from "difunkt";
import { APP_CONFIG } from "../core/config.providers";
import { DomainError } from "../core/errors";

export const ErrorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Unknown()),
  }),
});

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

interface ValidationIssue {
  path: string;
  message: string;
}

/** TypeBox reports every branch it tried; keep one issue per failing field. */
const summariseValidation = (error: ValidationError): ValidationIssue[] => {
  const seen = new Map<string, ValidationIssue>();
  for (const issue of error.all) {
    const path = "path" in issue && issue.path ? issue.path : "";
    if (seen.has(path)) continue;
    const message =
      ("summary" in issue && issue.summary) ||
      ("message" in issue && issue.message) ||
      "Invalid value";
    seen.set(path, { path, message });
  }
  return [...seen.values()];
};

const body = (code: string, message: string, details?: unknown): ErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

/**
 * One envelope for everything thrown in the request lifecycle. Domain errors
 * carry their own code and status, so handlers just throw; anything else is
 * logged and reported as a generic 500 rather than leaking internals.
 */
export const ErrorHandlerPlugin = createProvider(({ inject }) => {
  const config = inject(APP_CONFIG);

  return new Elysia({ name: "plugin.error-handler" }).onError(
    { as: "global" },
    ({ code, error, set, path, request }) => {
      if (error instanceof DomainError) {
        set.status = error.status;
        return body(error.code, error.message, error.details);
      }

      if (code === "VALIDATION" || error instanceof ValidationError) {
        set.status = 422;
        return body(
          "VALIDATION_ERROR",
          "Request failed validation",
          error instanceof ValidationError ? summariseValidation(error) : undefined,
        );
      }

      if (code === "NOT_FOUND") {
        set.status = 404;
        return body("ROUTE_NOT_FOUND", `No route matches ${request.method} ${path}`);
      }

      if (code === "PARSE") {
        set.status = 400;
        return body("INVALID_PAYLOAD", "Request body could not be parsed");
      }

      if (config.logging.enabled) {
        console.error(`[error] unhandled ${code} on ${request.method} ${path}`, error);
      }
      set.status = 500;
      return body("INTERNAL_ERROR", "An unexpected error occurred");
    },
  );
});

export type ApplicationErrorCode =
  | "INTERNAL_ERROR"
  | "INVALID_INPUT"
  | "TOO_MANY_REQUESTS"
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED";
export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApplicationError";
  }
}
export type SafeError = Readonly<{
  code: ApplicationErrorCode;
  message: string;
}>;
export function toSafeError(error: unknown): SafeError {
  if (error instanceof ApplicationError)
    return { code: error.code, message: error.message };
  return { code: "INTERNAL_ERROR", message: "An unexpected error occurred." };
}

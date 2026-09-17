export class LocalWriteError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "LocalWriteError";
    this.retryable = retryable;
  }
}

export function toLocalWriteError(error: unknown, fallback = "The change was not written to this iPad."): LocalWriteError {
  if (error instanceof LocalWriteError) {
    return error;
  }
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError") {
    return new LocalWriteError("This iPad is out of storage. The change was not saved.", false);
  }
  if (name === "InvalidStateError") {
    return new LocalWriteError("The local database is unavailable. The change was not saved.", true);
  }
  return new LocalWriteError(fallback, true);
}

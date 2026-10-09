export class WorkbenchError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
}
export function fail(code, message, details) { throw new WorkbenchError(code, message, details); }
export function envelope(error) {
  // Never echo untrusted provider messages, input values, URLs or exception stacks.
  return { ok: false, error: { code: error instanceof WorkbenchError ? error.code : 'INTERNAL_ERROR',
    message: error instanceof WorkbenchError ? error.message : 'Operation failed. Inspect local setup and retry.',
    details: error instanceof WorkbenchError ? error.details : {} } };
}

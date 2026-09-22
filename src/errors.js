// Shared error types so the pipeline can report stage-specific failures.

export class CompileError extends Error {}
export class RuntimeError extends Error {}

export class ReviewQuizError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
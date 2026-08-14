import type { Request, Response, NextFunction, RequestHandler } from "express";

// Wrap async route handlers to auto-catch errors → error middleware.
// Generic <P> preserves route-param type inference from Express's IRouterMatcher
// overloads (e.g. P = { id: string } for "/api/component/:id").
export function asyncHandler<P = Record<string, string>>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler<P> {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Error with HTTP status code for routes that need specific codes
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// Unified error-handling middleware
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
}

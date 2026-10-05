/** An error the global error handler turns into `{ error: message }` with this status. */
export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

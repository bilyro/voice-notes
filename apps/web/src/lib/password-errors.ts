// Task 1.35: the server's password rules, said the same way on sign-up and on the account page
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** A Better Auth error code for a password → what to tell the person; undefined if it isn't about the password. */
export function passwordMessage(error: { code?: string; status?: number; message?: string }): string | undefined {
  switch (error.code) {
    case "PASSWORD_TOO_SHORT": return `The password needs at least ${PASSWORD_MIN} characters.`;
    case "PASSWORD_TOO_LONG": return `The password can have at most ${PASSWORD_MAX} characters.`;
    case "PASSWORD_COMPROMISED": return "This password appeared in a data breach. Choose a different one.";
    case "PASSWORD_CONTAINS_PERSONAL_INFO": return "Don't use your name or email in the password.";
  }
  // the breach check couldn't reach its service: setting a password is refused until it can (fails closed)
  if (error.status === 500 && /check password/i.test(error.message ?? "")) return "The password couldn't be checked right now. Try again in a minute.";
  return undefined;
}

/** Stored errors are for us; people see what happened in plain words. */
export function failureText(error: string | null) {
  if (error === "No speech detected") return "No speech found in the audio";
  return "Processing failed";
}

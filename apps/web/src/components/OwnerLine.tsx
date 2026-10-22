import type { LanguageCode } from "@vn/shared";

/**
 * "Marta · Friday, April 11" / "Олена · до понеділка" / "Marta" / "No owner or date yet".
 * No English "by": the due date is kept as it was said (Task 1.23), often with its own "by" / "до" / "para".
 */
export function OwnerLine({ owner, due, lang }: { owner: string | null; due: string | null; lang: LanguageCode }) {
  if (!owner && !due) return <>No owner or date yet</>;
  return <span lang={lang}>{[owner, due].filter(Boolean).join(" · ")}</span>;
}

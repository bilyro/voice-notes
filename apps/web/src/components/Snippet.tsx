import { Fragment } from "react";
import { MARK_END, MARK_START } from "@vn/shared";
import styles from "./Snippet.module.css";

/** A search snippet: the words between the API's marks become <mark>; everything stays text, never HTML. */
export function Snippet({ text, lang }: { text: string; lang?: string }) {
  const parts = text.split(new RegExp(`(${MARK_START}[^${MARK_END}]*${MARK_END})`, "u"));
  return (
    <span lang={lang}>
      {parts.map((p, i) =>
        p.startsWith(MARK_START) && p.endsWith(MARK_END)
          ? <mark key={i} className={styles.mark}>{p.slice(MARK_START.length, -MARK_END.length)}</mark>
          : <Fragment key={i}>{p}</Fragment>,
      )}
    </span>
  );
}

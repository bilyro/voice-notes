import { useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

type Tab<T extends string> = { value: T; label: string };
type Props<T extends string> = {
  label: string;
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;          // the selected tab's panel
};

/** Text tabs (WAI-ARIA tabs pattern): arrow keys move between tabs, only the selected one is in the Tab order. */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.value === value);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    onChange(tabs[j]!.value);
    refs.current[j]?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.value}`}
            aria-selected={t.value === value}
            aria-controls={`panel-${t.value}`}
            tabIndex={t.value === value ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`}>
        {children}
      </div>
    </>
  );
}

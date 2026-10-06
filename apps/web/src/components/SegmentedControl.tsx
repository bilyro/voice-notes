import styles from "./SegmentedControl.module.css";

/** Card color family (docs/DESIGN.md: decision yellow, to-do green, idea lilac). */
export type Tone = "decision" | "todo" | "idea";

type Props<T extends string> = {
  legend: string;
  name: string;
  options: { value: T; label: string; tone?: Tone }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
};

/** A row of choice cards with real radio inputs inside, so arrow keys and screen readers work as usual. */
export function SegmentedControl<T extends string>({ legend, name, options, value, onChange, hint }: Props<T>) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.track}>
        {options.map((o) => (
          <label key={o.value} className={styles.segment} data-tone={o.tone}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={styles.radio}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </fieldset>
  );
}

import styles from "./SegmentedControl.module.css";

type Props<T extends string> = {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
};

/** Grey track with real radio inputs inside, so arrow keys and screen readers work as usual. */
export function SegmentedControl<T extends string>({ legend, name, options, value, onChange, hint }: Props<T>) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.track}>
        {options.map((o) => (
          <label key={o.value} className={styles.segment}>
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

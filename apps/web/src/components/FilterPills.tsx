import styles from "./FilterPills.module.css";

type Props<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/** Toggle buttons; the selected one is black. `aria-pressed` tells screen readers which is on. */
export function FilterPills<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={styles.pill} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

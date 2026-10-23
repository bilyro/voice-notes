import type { ComponentProps } from "react";
import styles from "./Select.module.css";

type Props = ComponentProps<"select"> & {
  /** sits next to its label in a row (the Owner filter) instead of filling the width */
  inline?: boolean;
};

/**
 * A native select (keyboard and screen readers work as usual) with our own chevron instead of the browser's arrow,
 * which sat squeezed against the right edge (Task 1.39). Pass the field's look as `className`.
 */
export function Select({ inline, className, ...props }: Props) {
  return (
    <span className={`${styles.wrap} ${inline ? styles.inline : ""}`}>
      <select className={`${className ?? ""} ${styles.select}`} {...props} />
    </span>
  );
}

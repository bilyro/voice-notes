import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Button.module.css";

type Look = {
  variant?: "primary" | "secondary";
  size?: "default" | "small";
  block?: boolean;
};

function classes({ variant = "primary", size = "default", block = false }: Look, extra?: string) {
  return [
    styles.button,
    styles[variant],
    size === "small" && styles.small,
    block && styles.block,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({ variant, size, block, className, ...props }: Look & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={classes({ variant, size, block }, className)} {...props} />;
}

/** Looks like a button, navigates like a link. */
export function ButtonLink({ variant, size, block, className, ...props }: Look & LinkProps) {
  return <Link className={classes({ variant, size, block }, className)} {...props} />;
}

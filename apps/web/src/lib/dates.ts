/** Monday 00:00 of the week `d` is in (weeks start on Monday). */
export function startOfWeek(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** "This week", "Last week", then the month: "September 2026". */
export function groupLabel(date: Date, now = new Date()) {
  const thisWeek = startOfWeek(now);
  if (date >= thisWeek) return "This week";
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  if (date >= lastWeek) return "Last week";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "Thu, Oct 1" */
export const shortDate = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

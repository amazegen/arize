export function patternDayPosition(day: string, first: string, last: string) {
  const at = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const span = at(last) - at(first);
  return 24 + (span > 0 ? Math.max(0, Math.min(1, (at(day) - at(first)) / span)) : 0) * 552;
}

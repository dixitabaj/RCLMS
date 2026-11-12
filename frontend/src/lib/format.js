// 10500000 -> "10.5M"
export function compact(n) {
  const v = Math.abs(n);
  if (v >= 1e9) return trim(n / 1e9) + 'B';
  if (v >= 1e6) return trim(n / 1e6) + 'M';
  if (v >= 1e3) return trim(n / 1e3) + 'K';
  return trim(n);
}
const trim = (x) => String(Math.round(x * 100) / 100);

export const full = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Round a maximum up to a "nice" number and return 5 evenly spaced ticks from 0.
export function niceScale(max) {
  if (!(max > 0)) return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  const nice = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  return { max: nice, ticks: [0, 0.25, 0.5, 0.75, 1].map((t) => t * nice) };
}

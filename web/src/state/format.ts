export const DASH = '—';

export const v = (x: string | number | null | undefined, suffix = '') =>
  x === null || x === undefined || x === '' ? DASH : `${x}${suffix}`;

export function timeOfDay(isoStr: string | null | undefined) {
  if (!isoStr) return DASH;
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(isoStr: string | null | undefined) {
  if (!isoStr) return DASH;
  const d = new Date(isoStr);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relDay(isoStr: string) {
  const d = new Date(isoStr);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function logTime(isoStr: string) {
  const d = new Date(isoStr);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function duration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function countdown(toIso: string | null | undefined, now: number) {
  if (!toIso) return DASH;
  let s = Math.max(0, Math.floor((Date.parse(toIso) - now) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m ${String(s).padStart(2, '0')} s` : `${m} m ${String(s).padStart(2, '0')} s`;
}

const longDay = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const weekdayDay = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' });
const monthYear = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

/** Le date "di calendario" sono stringhe YYYY-MM-DD, lette in ora locale. */
export function fromDay(day: string): Date {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, date);
}

export function toDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function today(): string {
  return toDay(new Date());
}

export function addDays(day: string, amount: number): string {
  const date = fromDay(day);
  date.setDate(date.getDate() + amount);
  return toDay(date);
}

/** 1 = lunedì … 7 = domenica */
export function weekdayIndex(day: string): number {
  return ((fromDay(day).getDay() + 6) % 7) + 1;
}

export function startOfWeek(day: string): string {
  return addDays(day, 1 - weekdayIndex(day));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, amount: number): string {
  const date = fromDay(startOfMonth(day));
  date.setMonth(date.getMonth() + amount);
  return toDay(date);
}

/** "2024-10-03" → "3 ottobre 2024" */
export function formatDay(day: string): string {
  return longDay.format(fromDay(day));
}

/** "2026-09-15" → "mar 15" */
export function formatWeekdayShort(day: string): string {
  return weekdayDay.format(fromDay(day));
}

/** "2026-09-15" → "martedì 15 settembre" */
export function formatWeekdayLong(day: string): string {
  return weekdayLong.format(fromDay(day));
}

/** "2026-09-01" → "settembre 2026" */
export function formatMonth(day: string): string {
  return monthYear.format(fromDay(day));
}

/** "14 – 20 settembre" oppure "28 settembre – 4 ottobre" */
export function formatRange(from: string, to: string): string {
  const start = fromDay(from);
  const end = fromDay(to);
  const endMonth = monthName.format(end);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} – ${end.getDate()} ${endMonth}`;
  return `${start.getDate()} ${monthName.format(start)} – ${end.getDate()} ${endMonth}`;
}

/** Timestamp ISO → "12 set 2026" */
export function formatTimestamp(iso: string): string {
  return shortDay.format(new Date(iso));
}

/** "3/10/2024" → "2024-10-03", oppure null se la data non esiste. */
export function parseItalianDate(input: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return toDay(date);
}

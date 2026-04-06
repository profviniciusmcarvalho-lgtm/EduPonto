import { format } from 'date-fns';
import { TimeLog, UserProfile } from '@/src/types';

/** Grace period in minutes before a clock-in is considered late. */
const LATE_GRACE_MINUTES = 15;

/**
 * Returns true if a "clock-in" log is late relative to the user's scheduled
 * start time (with a 15-minute grace period).
 */
export function isLate(
  log: TimeLog,
  user?: Pick<UserProfile, 'startTime'>,
): boolean {
  if (log.type !== 'in') return false;
  const [startH, startM] = (user?.startTime ?? '08:00').split(':').map(Number);
  const t = new Date(log.timestamp);
  const startMinutes = startH * 60 + startM + LATE_GRACE_MINUTES;
  const logMinutes = t.getHours() * 60 + t.getMinutes();
  return logMinutes > startMinutes;
}

/**
 * Counts the number of days in the given log list where the first clock-in
 * was late, relative to the user's scheduled start time.
 */
export function countDelays(
  logs: TimeLog[],
  user?: Pick<UserProfile, 'startTime'>,
): number {
  const logsByDay = new Map<string, TimeLog[]>();
  for (const log of logs) {
    const day = format(new Date(log.timestamp), 'yyyy-MM-dd');
    if (!logsByDay.has(day)) logsByDay.set(day, []);
    logsByDay.get(day)!.push(log);
  }

  let delays = 0;
  logsByDay.forEach((dayLogs) => {
    const firstIn = dayLogs
      .filter((l) => l.type === 'in')
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0];
    if (firstIn && isLate(firstIn, user)) delays++;
  });
  return delays;
}

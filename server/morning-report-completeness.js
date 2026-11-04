const parisDay = at => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(at));

// Report projection only: a completed current morning cycle, not a change's
// publication date or a requirement to run again after the Brief's 08:00 cutoff.
export const hasCurrentMorningCompletion = (row, window, at) => {
  const checked = Date.parse(row.last_checked_at), cutoff = Date.parse(window.cutoff);
  if (row.last_check_error_code || !Number.isFinite(checked) || checked > new Date(at).getTime()
    || parisDay(checked) !== window.day) return false;
  const schedule = row._morning_schedule;
  if (!schedule) return true; // Legacy durable check: current Paris morning.
  const next = Date.parse(schedule.next_due_at), interval = Number(schedule.interval_seconds)*1000;
  if (Number(schedule.failures)>0 || !Number.isFinite(next) || !(interval>0)) return false;
  // Completion advances next_due_at. When work remains due, that outstanding
  // deadline is still authoritative. Never accept yesterday's completion.
  const expected = next<=cutoff ? next : next-interval;
  return expected>cutoff || checked>=expected;
};

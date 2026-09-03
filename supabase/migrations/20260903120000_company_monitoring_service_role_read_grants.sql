-- Allow the scheduled service-role client to load eligible Watches and their current snapshots.
-- All scheduled writes remain behind the existing security-definer functions.
grant select on table public.watches to service_role;
grant select on table public.company_watch_snapshots to service_role;

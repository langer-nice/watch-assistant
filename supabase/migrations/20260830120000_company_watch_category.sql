-- Persist the existing canonical Watch category identifiers for authenticated Company Watches.
-- Existing rows retain their data and receive the canonical General identifier.
alter table public.watches
  add column category text not null default 'general',
  add constraint watches_category_check
    check (category in (
      'general', 'travel', 'news', 'property', 'price', 'events', 'entertainment', 'finance'
    ));

comment on column public.watches.category is
  'Stable canonical Watch category identifier; localized labels are derived by the client.';

-- Rollback (only if the application no longer reads or writes Watch categories):
-- alter table public.watches
--   drop constraint if exists watches_category_check,
--   drop column if exists category;

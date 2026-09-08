-- Runs are logged alongside walks and rides. The type check has to be dropped
-- and recreated: Postgres has no "add a value to a check constraint".
alter table public.activities
  drop constraint activities_type_check,
  add constraint activities_type_check check (type in ('walk', 'run', 'bike'));

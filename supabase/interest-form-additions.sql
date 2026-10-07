-- Additive schema for the three existing interest forms.
-- Existing columns, records, INSERT policies, and notification flow are unchanged.
begin;

alter table public.hacker_interest add column if not exists extra_data jsonb default '{}'::jsonb;
alter table public.hacker_interest add column if not exists resume_path text;
alter table public.judge_mentor_interest add column if not exists extra_data jsonb default '{}'::jsonb;
alter table public.sponsor_interest add column if not exists extra_data jsonb default '{}'::jsonb;

create table if not exists public.hacker_interest_details (
  interest_id bigint primary key references public.hacker_interest(id) on delete cascade,
  answers jsonb not null,
  resume_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.judge_mentor_interest_details (
  interest_id bigint primary key references public.judge_mentor_interest(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.sponsor_interest_details (
  interest_id bigint primary key references public.sponsor_interest(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.hacker_interest_details enable row level security;
alter table public.judge_mentor_interest_details enable row level security;
alter table public.sponsor_interest_details enable row level security;
revoke all on public.hacker_interest_details, public.judge_mentor_interest_details, public.sponsor_interest_details from public, anon, authenticated;
grant all on public.hacker_interest_details, public.judge_mentor_interest_details, public.sponsor_interest_details to service_role;

-- Save the new answers within the existing INSERT transaction. Old form submissions
-- omit extra_data and take the same path they always have, with no details row.
-- This trigger function is private and cannot be called through the Data API.
create schema if not exists registration_private;
revoke all on schema registration_private from public, anon, authenticated;
create or replace function registration_private.save_interest_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' or tg_table_schema <> 'public' then
    raise exception 'Unsupported interest trigger';
  end if;
  if new.extra_data is null or new.extra_data = '{}'::jsonb then
    return new;
  end if;
  case tg_table_name
    when 'hacker_interest' then
      insert into public.hacker_interest_details (interest_id, answers, resume_path)
        values (new.id, new.extra_data, new.resume_path);
    when 'judge_mentor_interest' then
      insert into public.judge_mentor_interest_details (interest_id, answers)
        values (new.id, new.extra_data);
    when 'sponsor_interest' then
      insert into public.sponsor_interest_details (interest_id, answers)
        values (new.id, new.extra_data);
    else raise exception 'Unsupported interest table';
  end case;
  return new;
end;
$$;
revoke all on function registration_private.save_interest_details() from public, anon, authenticated;
-- Re-running this reviewed setup only replaces its own additive triggers.
drop trigger if exists save_extra_interest_answers on public.hacker_interest;
create trigger save_extra_interest_answers after insert on public.hacker_interest
  for each row execute function registration_private.save_interest_details();
drop trigger if exists save_extra_interest_answers on public.judge_mentor_interest;
create trigger save_extra_interest_answers after insert on public.judge_mentor_interest
  for each row execute function registration_private.save_interest_details();
drop trigger if exists save_extra_interest_answers on public.sponsor_interest;
create trigger save_extra_interest_answers after insert on public.sponsor_interest
  for each row execute function registration_private.save_interest_details();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('revuc-2027-resumes', 'revuc-2027-resumes', false, 4194304, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['application/pdf'];
-- No public resume access policy or public download URL.
commit;

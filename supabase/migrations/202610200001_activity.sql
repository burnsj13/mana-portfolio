-- Append-only collection activity, including edits made in the SQL/Table Editor.
create table public.portfolio_activity (
  id bigint generated always as identity primary key,
  collection text not null references public.portfolio_collections(slug),
  entry_id uuid not null,
  action text not null check(action in ('added','updated','removed')),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  before_card jsonb,
  after_card jsonb
);
create index portfolio_activity_recent on public.portfolio_activity(collection,id desc);
alter table public.portfolio_activity enable row level security;
revoke all on public.portfolio_activity from public,anon,authenticated;
grant select on public.portfolio_activity to authenticated;
grant all on public.portfolio_activity to service_role;
grant usage,select on sequence public.portfolio_activity_id_seq to service_role;
create policy activity_member_read on public.portfolio_activity for select to authenticated
using((select public.portfolio_member()));
create function public.portfolio_record_activity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then
    insert into public.portfolio_activity(collection,entry_id,action,actor_id,after_card)
      values(new.collection,new.entry_id,'added',auth.uid(),new.payload);
    return new;
  elsif TG_OP='DELETE' then
    insert into public.portfolio_activity(collection,entry_id,action,actor_id,before_card)
      values(old.collection,old.entry_id,'removed',auth.uid(),old.payload);
    return old;
  else
    if old.payload is distinct from new.payload then
      insert into public.portfolio_activity(collection,entry_id,action,actor_id,before_card,after_card)
        values(new.collection,new.entry_id,'updated',auth.uid(),old.payload,new.payload);
    end if;
    return new;
  end if;
end $$;
revoke all on function public.portfolio_record_activity() from public,anon,authenticated;
create trigger portfolio_card_activity after insert or update or delete on public.portfolio_cards
for each row execute function public.portfolio_record_activity();

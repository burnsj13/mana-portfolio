-- Private dashboards, authenticated owners only. Assign owners in SQL Editor;
-- clients cannot claim a collection or change its owner.
create table public.portfolio_collections (
  slug text primary key check (slug in ('main','jacob')),
  owner_id uuid references auth.users(id) on delete set null,
  initialized boolean not null default false
);
insert into public.portfolio_collections(slug) values ('main'),('jacob');

create function public.portfolio_card_valid(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p)='object'
    and (p->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and length(p->>'n') between 1 and 300
    and p->>'f' in ('normal','foil','etched')
    and jsonb_typeof(p->'q')='number' and (p->>'q') ~ '^[1-9][0-9]{0,5}$'
    and jsonb_typeof(p->'cost')='number' and (p->>'cost')::numeric between 0 and 1000000
    and p->>'proxy' in ('true','false')
    and length(coalesce(p->>'binder','')) <= 200, false)
$$;
create table public.portfolio_cards (
  entry_id uuid primary key default gen_random_uuid(),
  collection text not null references public.portfolio_collections(slug),
  payload jsonb not null check (public.portfolio_card_valid(payload))
);
create index portfolio_cards_collection on public.portfolio_cards(collection,entry_id);
create table public.portfolio_settings (
  collection text primary key references public.portfolio_collections(slug),
  settings jsonb not null check (jsonb_typeof(settings)='object'
    and settings->>'version'='1' and jsonb_typeof(settings->'alerts')='object'
    and jsonb_typeof(settings->'watchlist')='array'
    and jsonb_array_length(settings->'watchlist') <= 200)
);
alter table public.portfolio_collections enable row level security;
alter table public.portfolio_cards enable row level security;
alter table public.portfolio_settings enable row level security;
revoke all on public.portfolio_collections, public.portfolio_cards, public.portfolio_settings from anon, authenticated;
grant select on public.portfolio_collections, public.portfolio_cards, public.portfolio_settings to authenticated;
grant insert,update,delete on public.portfolio_cards to authenticated;
grant update on public.portfolio_settings to authenticated;
create function public.portfolio_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.portfolio_collections where owner_id=(select auth.uid()))
$$;
revoke all on function public.portfolio_member() from public,anon;
grant execute on function public.portfolio_member() to authenticated;
create policy collections_member_read on public.portfolio_collections for select to authenticated using ((select public.portfolio_member()));
create policy cards_member_read on public.portfolio_cards for select to authenticated using ((select public.portfolio_member()));
create policy settings_member_read on public.portfolio_settings for select to authenticated using ((select public.portfolio_member()));
create policy cards_owner on public.portfolio_cards for all to authenticated
  using (exists(select 1 from public.portfolio_collections c where c.slug=collection and c.initialized and c.owner_id=(select auth.uid())))
  with check (exists(select 1 from public.portfolio_collections c where c.slug=collection and c.initialized and c.owner_id=(select auth.uid())));
create policy settings_owner on public.portfolio_settings for update to authenticated
  using (exists(select 1 from public.portfolio_collections c where c.slug=collection and c.initialized and c.owner_id=(select auth.uid())))
  with check (exists(select 1 from public.portfolio_collections c where c.slug=collection and c.initialized and c.owner_id=(select auth.uid())));

-- One atomic, owner-only import; retries cannot reset an existing collection.
create function public.portfolio_initialize(p_slug text,p_cards jsonb,p_settings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.portfolio_collections;
begin
  select * into c from public.portfolio_collections where slug=p_slug for update;
  if c.owner_id is null or c.owner_id is distinct from auth.uid() then
    raise exception 'Only the assigned collection owner can import' using errcode='42501';
  end if;
  if c.initialized then raise exception 'Collection already imported'; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards)>20000 then
    raise exception 'Invalid collection import';
  end if;
  insert into public.portfolio_cards(collection,payload)
    select p_slug,value from jsonb_array_elements(p_cards);
  insert into public.portfolio_settings(collection,settings) values(p_slug,p_settings);
  update public.portfolio_collections set initialized=true where slug=p_slug;
end $$;
revoke all on function public.portfolio_initialize(text,jsonb,jsonb) from public,anon;
grant execute on function public.portfolio_initialize(text,jsonb,jsonb) to authenticated;

-- GitHub Actions performs the initial import using a repository secret.
create function public.portfolio_bootstrap(p_slug text,p_cards jsonb,p_settings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.portfolio_collections;
begin
  select * into c from public.portfolio_collections where slug=p_slug for update;
  if c.owner_id is null then raise exception 'Assign a collection owner before importing'; end if;
  if c.initialized then return; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards)>20000 then raise exception 'Invalid collection import'; end if;
  insert into public.portfolio_cards(collection,payload) select p_slug,value from jsonb_array_elements(p_cards);
  insert into public.portfolio_settings(collection,settings) values(p_slug,p_settings);
  update public.portfolio_collections set initialized=true where slug=p_slug;
end $$;
revoke all on function public.portfolio_bootstrap(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.portfolio_bootstrap(text,jsonb,jsonb) to service_role;
grant all on public.portfolio_collections,public.portfolio_cards,public.portfolio_settings to service_role;

insert into storage.buckets(id,name,public) values('portfolio-history','portfolio-history',false);
create policy portfolio_history_owner on storage.objects for select to authenticated
using(bucket_id='portfolio-history' and (storage.foldername(name))[1] in ('main','jacob') and (select public.portfolio_member()));

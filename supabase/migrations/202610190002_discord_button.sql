-- Anonymous HTTP requests may trigger Discord, but only the function's server
-- credential can claim a delivery slot. One send per collection per minute.
create table public.portfolio_discord_cooldown (
  collection text primary key references public.portfolio_collections(slug),
  sent_at timestamptz not null
);
alter table public.portfolio_discord_cooldown enable row level security;
revoke all on public.portfolio_discord_cooldown from public,anon,authenticated;
grant all on public.portfolio_discord_cooldown to service_role;
create function public.portfolio_claim_discord(p_collection text) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed text;
begin
  if p_collection not in ('main','jacob') then return false; end if;
  insert into public.portfolio_discord_cooldown(collection,sent_at)
    values(p_collection,clock_timestamp())
    on conflict(collection) do update set sent_at=excluded.sent_at
    where public.portfolio_discord_cooldown.sent_at < clock_timestamp()-interval '60 seconds'
    returning collection into claimed;
  return claimed is not null;
end $$;
revoke all on function public.portfolio_claim_discord(text) from public,anon,authenticated;
grant execute on function public.portfolio_claim_discord(text) to service_role;

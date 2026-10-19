-- First create these two users in Authentication > Users > Add user.
-- Choose passwords privately and enable Auto Confirm User. No email is sent.
do $$
declare joe uuid; jacob uuid;
begin
 select id into joe from auth.users where lower(email)='joe@mana-portfolio.invalid';
 select id into jacob from auth.users where lower(email)='jacob@mana-portfolio.invalid';
 if joe is null or jacob is null then raise exception 'Create both Joe and Jacob accounts first'; end if;
 update public.portfolio_collections set owner_id=joe where slug='main';
 update public.portfolio_collections set owner_id=jacob where slug='jacob';
end $$;

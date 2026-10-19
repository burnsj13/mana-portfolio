// Run after npm install --prefix work/sql-test @electric-sql/pglite@0.5.10
const fs=require('fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_PATH||'../work/sql-test/node_modules/@electric-sql/pglite');
const ids={joe:'00000000-0000-0000-0000-000000000001',jacob:'00000000-0000-0000-0000-000000000002',stranger:'00000000-0000-0000-0000-000000000003'};
const card={id:'10000000-0000-0000-0000-000000000001',n:"Urza's Saga",f:'normal',q:1,cost:0,proxy:'false',binder:'Test'};
const settings={version:1,alerts:{enabled:true},watchlist:[]};
(async()=>{
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`);
 await db.exec(fs.readFileSync('supabase/migrations/202610190001_portfolio.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610190002_discord_button.sql','utf8'));
 for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2)',[id,name+'@mana-portfolio.invalid']);
 await db.query("update public.portfolio_collections set owner_id=$1 where slug='main'",[ids.joe]);await db.query("update public.portfolio_collections set owner_id=$1 where slug='jacob'",[ids.jacob]);
 await db.exec("set role service_role");for(const slug of ['main','jacob'])await db.query('select public.portfolio_bootstrap($1,$2,$3)',[slug,JSON.stringify([card]),JSON.stringify(settings)]);await db.exec('reset role');
 await db.exec("insert into storage.objects(bucket_id,name) values('portfolio-history','main/latest.json'),('portfolio-history','jacob/latest.json');");
 async function as(name){await db.exec('reset role;set role '+(name==='anon'?'anon':'authenticated'));await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||''])}
 await as('anon');await assert.rejects(db.query('select * from public.portfolio_cards'),/permission denied/);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await as('stranger');assert.equal((await db.query('select * from public.portfolio_collections')).rows.length,0);assert.equal((await db.query('select * from public.portfolio_cards')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 for(const name of ['joe','jacob']){
  await as(name);const mine=name==='joe'?'main':'jacob',other=name==='joe'?'jacob':'main';
  assert.equal((await db.query('select * from public.portfolio_cards')).rows.length,2);assert.equal((await db.query('select * from storage.objects')).rows.length,2);
  assert.equal((await db.query('update public.portfolio_cards set payload=$1 where collection=$2 returning *',[JSON.stringify({...card,q:2}),mine])).rows.length,1);
  const added=await db.query('insert into public.portfolio_cards(collection,payload) values($1,$2) returning entry_id',[mine,JSON.stringify(card)]);
  assert.equal((await db.query('delete from public.portfolio_cards where entry_id=$1 returning *',[added.rows[0].entry_id])).rows.length,1);
  assert.equal((await db.query('update public.portfolio_settings set settings=$1 where collection=$2 returning *',[JSON.stringify(settings),mine])).rows.length,1);
  assert.equal((await db.query('delete from public.portfolio_cards where collection=$1 returning *',[other])).rows.length,0);
  await assert.rejects(db.query('insert into public.portfolio_cards(collection,payload) values($1,$2)',[other,JSON.stringify(card)]),/row-level security/);
  await assert.rejects(db.query('update public.portfolio_cards set collection=$1 where collection=$2',[other,mine]),/row-level security/);
  assert.equal((await db.query('update public.portfolio_settings set settings=$1 where collection=$2 returning *',[JSON.stringify(settings),other])).rows.length,0);
  await assert.rejects(db.query('update public.portfolio_collections set owner_id=$1 where slug=$2',[ids[name],other]),/permission denied/);
  await assert.rejects(db.query('select public.portfolio_bootstrap($1,$2,$3)',[mine,'[]',JSON.stringify(settings)]),/permission denied/);
  await assert.rejects(db.query('select public.portfolio_initialize($1,$2,$3)',[mine,'[]',JSON.stringify(settings)]),/already imported/);
 }
 await as('joe');await assert.rejects(db.query("select public.portfolio_claim_discord('main')"),/permission denied/);
 await db.exec('reset role;set role service_role');assert.equal((await db.query("select public.portfolio_claim_discord('main') as ok")).rows[0].ok,true);assert.equal((await db.query("select public.portfolio_claim_discord('main') as ok")).rows[0].ok,false);assert.equal((await db.query("select public.portfolio_claim_discord('jacob') as ok")).rows[0].ok,true);
 await db.exec("update public.portfolio_discord_cooldown set sent_at=now()-interval '61 seconds' where collection='main'");assert.equal((await db.query("select public.portfolio_claim_discord('main') as ok")).rows[0].ok,true);
 await db.close();console.log('PASS Postgres RLS and atomic per-collection Discord cooldown');
})().catch(e=>{console.error(e.message);process.exitCode=1});

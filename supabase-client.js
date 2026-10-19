'use strict';
var PortfolioCloud=(()=>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 function validateCard(c){if(!c||!uuid.test(c.id)||!c.n||c.n.length>300||!['normal','foil','etched'].includes(c.f)||!Number.isInteger(c.q)||c.q<1||c.q>999999||!Number.isFinite(c.cost)||c.cost<0||c.cost>1000000||!['true','false'].includes(c.proxy)||(c.binder||'').length>200)throw Error('Invalid card: check printing, quantity, finish and purchase price.');return c}
 function create(config,profile,fetcher=fetch,storage=null){
  if(!['main','jacob'].includes(profile))throw Error('Invalid collection');
  const origin=new URL(config.url);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||origin.pathname!=='/')throw Error('Invalid Supabase project URL');
  if(!config.publishableKey?.startsWith('sb_publishable_'))throw Error('A public Supabase publishable key is required');
  const sessionKey='mana-auth-'+origin.hostname;let session=null,refreshing=null;
  try{session=JSON.parse(storage?.getItem(sessionKey)||'null')}catch{}
  function remember(value){session=value;try{if(value)storage?.setItem(sessionKey,JSON.stringify(value));else storage?.removeItem(sessionKey)}catch{}}
  async function request(path,{method='GET',body,auth=false,prefer}={}){
   if(auth)await refresh();
   const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
   if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
   if(prefer)headers.Prefer=prefer;
   const response=await fetcher(origin.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error'});
   if(!response.ok){let detail;try{detail=await response.json()}catch{}throw Error(detail?.msg||detail?.message||detail?.error_description||'Supabase request failed ('+response.status+').')}
   return response.status===204?null:response.json();
  }
  async function refresh(){
   if(!session?.access_token)throw Error('Sign in to edit this collection.');
   if(session.expires_at*1000>Date.now()+60000)return;
   if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(s=>remember({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in})).catch(e=>{remember(null);throw e}).finally(()=>{refreshing=null});
   await refreshing;
  }
  async function list(table){let result=[];for(let offset=0;;offset+=500){const page=await request('/rest/v1/'+table+'?collection=eq.'+profile+'&select=*&order=entry_id&limit=500&offset='+offset,{auth:true});result.push(...page);if(page.length<500)return result}}
  return {
   async signIn(email,password){remember(null);const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});remember({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in});return s.user},
   async signOut(){try{if(session)await request('/auth/v1/logout',{method:'POST',auth:true})}finally{remember(null)}},
   async user(){if(!session)return null;try{return await request('/auth/v1/user',{auth:true})}catch(e){remember(null);throw e}},
   async load(){await refresh();const rows=await request('/rest/v1/portfolio_collections?slug=eq.'+profile+'&select=*',{auth:true});if(!rows.length)throw Error('This account is not authorized for this collection.');const collection=rows[0];if(!collection.initialized)return {collection,cards:null,settings:null};const cards=await list('portfolio_cards'),settings=await request('/rest/v1/portfolio_settings?collection=eq.'+profile+'&select=settings');return {collection,cards:cards.map(r=>({...r.payload,entry_id:r.entry_id})),settings:settings[0]?.settings}},
   async asset(name){if(!/^(latest|metadata|history-index|alert-status)\.json$|^history\/\d{4}-\d{2}\.json$|^wishlist\/(latest|history-index)\.json$|^wishlist\/history\/\d{4}-\d{2}\.json$/.test(name))throw Error('Invalid private asset');await refresh();return fetcher(origin.origin+'/storage/v1/object/authenticated/portfolio-history/'+profile+'/'+name,{headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token},cache:'no-store',redirect:'error'})},
   async initialize(cards,settings){cards.forEach(validateCard);return request('/rest/v1/rpc/portfolio_initialize',{method:'POST',auth:true,body:{p_slug:profile,p_cards:cards.map(({entry_id,...c})=>c),p_settings:settings}})},
   async saveSettings(settings){const result=await request('/rest/v1/portfolio_settings?collection=eq.'+profile,{method:'PATCH',auth:true,body:{settings},prefer:'return=representation'});if(result.length!==1)throw Error('Settings were not saved. Sign in as this collection’s owner.');return result[0].settings},
   async saveCard(c){validateCard(c);const {entry_id,...payload}=c;if(entry_id&&!uuid.test(entry_id))throw Error('Invalid collection entry');const result=await request('/rest/v1/portfolio_cards'+(entry_id?'?collection=eq.'+profile+'&entry_id=eq.'+entry_id:''),{method:entry_id?'PATCH':'POST',auth:true,body:entry_id?{payload}:{collection:profile,payload},prefer:'return=representation'});if(result.length!==1)throw Error('Card was not saved. Sign in as this collection’s owner.');return {...result[0].payload,entry_id:result[0].entry_id}},
   async removeCard(id){if(!uuid.test(id))throw Error('Invalid collection entry');const result=await request('/rest/v1/portfolio_cards?collection=eq.'+profile+'&entry_id=eq.'+id,{method:'DELETE',auth:true,prefer:'return=representation'});if(result.length!==1)throw Error('Card was not removed. Sign in as this collection’s owner.')}
  };
 }
 return {create,validateCard};
})();

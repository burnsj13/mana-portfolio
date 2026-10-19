// Intentionally public: no user JWT required. Destinations and message contents
// are fixed server-side; callers cannot supply a URL, text, or credentials.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(status,value,headers={}){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json',...headers}})}
export async function handler(req,fetcher=fetch,env=Deno.env){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json(405,{error:'Use POST to request a Discord graph.'});
 let body;try{const raw=await req.text();if(raw.length>200)return json(400,{error:'Invalid request.'});body=JSON.parse(raw)}catch{return json(400,{error:'Invalid request.'})}
 const profile=body?.collection;if(!['main','jacob'].includes(profile))return json(400,{error:'Choose main or jacob.'});
 const base=env.get('SUPABASE_URL'),key=env.get('SUPABASE_SERVICE_ROLE_KEY'),webhook=env.get(profile==='main'?'DISCORD_WEBHOOK_MAIN':'DISCORD_WEBHOOK_JACOB');
 if(!base||!key||!webhook)return json(503,{error:'Discord delivery is not configured in Supabase yet.'});
 let destination;try{destination=new URL(webhook);if(destination.protocol!=='https:'||!['discord.com','discordapp.com'].includes(destination.hostname)||!destination.pathname.startsWith('/api/webhooks/'))throw Error()}catch{return json(503,{error:'Discord destination configuration is invalid.'})}
 const headers={apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
 try{
  const claim=await fetcher(base+'/rest/v1/rpc/portfolio_claim_discord',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_collection:profile}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!claim.ok)return json(503,{error:'Discord cooldown setup is incomplete. Apply the database migration.'});
  if(await claim.json()!==true)return json(429,{error:'A graph was recently requested for this collection. Try again in one minute.'},{'Retry-After':'60'});
  const path=base+'/storage/v1/object/authenticated/portfolio-history/'+profile+'/';
  const [summary,image]=await Promise.all(['discord-summary.json','discord-graph.png'].map(name=>fetcher(path+name,{headers,redirect:'error',signal:AbortSignal.timeout(15000)})));
  if(!summary.ok||!image.ok)return json(503,{error:'The saved Discord graph is not ready. Wait for the next successful price update.'});
  const data=await summary.json();if(typeof data.content!=='string'||!data.content.length)return json(503,{error:'Saved Discord summary is unavailable.'});
  const form=new FormData();form.append('payload_json',JSON.stringify({content:data.content.slice(0,1900),allowed_mentions:{parse:[]},attachments:[{id:0,filename:'portfolio.png'}]}));form.append('files[0]',await image.blob(),'portfolio.png');
  destination.searchParams.set('wait','true');
  const result=await fetcher(destination.href,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!result.ok)return json(result.status===429?429:502,{error:result.status===429?'Discord is rate-limiting requests. Try again later.':'Discord rejected delivery. Check the Supabase webhook secret.'});
  return json(200,{sent:true,checkedAt:data.checkedAt});
 }catch{return json(502,{error:'Delivery could not be confirmed. Wait a minute before retrying.'})}
}
Deno.serve(req=>handler(req));

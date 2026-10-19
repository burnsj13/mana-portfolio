'use strict';
var GitHubSettings=(()=>{
 function encode(value){return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value,null,2)),b=>String.fromCharCode(b)).join(''))}
 function decode(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))))}
 function create(profile,fetcher=fetch){
  if(!['main','jacob'].includes(profile))throw Error('Unknown collection');
  const endpoint=`https://api.github.com/repos/burnsj13/mana-portfolio/contents/settings/${profile}.json`;
  let token='',sha='';
  async function request(method,body,target=endpoint){
   if(!token)throw Error('Connect your GitHub token first.');
   const response=await fetcher(target+(method==='GET'&&target===endpoint?'?ref=main':''),{method,cache:'no-store',redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok){
    if(response.status===401){token='';throw Error('GitHub authentication expired or the token is invalid. Reconnect.')}
    if(response.status===403)throw Error(target.includes('/actions/')?'GitHub denied access to the Discord test workflow. Use a fine-grained token owned by burnsj13, select mana-portfolio under repository access, and enable Actions: Read and write. Repository policies or pending token approval may also restrict access.':'GitHub denied access to the settings file. Legacy GitHub saving requires Contents: Read and write; Supabase saving does not require a GitHub token.');
    if(response.status===404&&target.includes('/actions/'))throw Error('GitHub could not access prices.yml in burnsj13/mana-portfolio. Check the token’s selected repository and push the latest workflow to main.');
    if(response.status===409||response.status===422)throw Error('The settings file changed or GitHub rejected the update. Reconnect to reload the latest version before saving.');
    throw Error('GitHub request failed (HTTP '+response.status+').');
   }
   return response.status===204?{}:response.json();
  }
  return {
   async connect(value){token=value.trim();try{const file=await request('GET');sha=file.sha;return decode(file.content)}catch(error){token='';sha='';throw error}},
   async connectDiscord(value){token=value.trim();sha='';try{await request('GET',undefined,'https://api.github.com/repos/burnsj13/mana-portfolio/actions/workflows/prices.yml')}catch(error){token='';throw error}},
   disconnect(){token='';sha=''},
   async sendDiscordTest(){await request('POST',{ref:'main',inputs:{discord_snapshot:true,discord_collection:profile,backfill:false}},'https://api.github.com/repos/burnsj13/mana-portfolio/actions/workflows/prices.yml/dispatches')},
   async save(settings){
    if(!sha)throw Error('Connect to GitHub first.');
    const file=await request('GET');
    if(file.sha!==sha)throw Error('Published settings changed since connection. Reconnect and review the latest settings before saving.');
    const result=await request('PUT',{message:`Update ${profile} wishlist and alert settings`,branch:'main',sha,content:encode(settings)});
    sha=result.content.sha;return result.commit?.html_url||'';
   }
  };
 }
 return {create,encode,decode};
})();

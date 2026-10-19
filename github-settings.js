'use strict';
var GitHubSettings=(()=>{
 function encode(value){return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value,null,2)),b=>String.fromCharCode(b)).join(''))}
 function decode(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))))}
 function create(profile,fetcher=fetch){
  if(!['main','jacob'].includes(profile))throw Error('Unknown collection');
  const endpoint=`https://api.github.com/repos/burnsj13/mana-portfolio/contents/settings/${profile}.json`;
  let token='',sha='';
  async function request(method,body){
   if(!token)throw Error('Connect your GitHub token first.');
   const response=await fetcher(endpoint+(method==='GET'?'?ref=main':''),{method,cache:'no-store',redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok){
    if(response.status===401){token='';throw Error('GitHub authentication expired or the token is invalid. Reconnect.')}
    if(response.status===403)throw Error('GitHub denied access. Use a token for this repository with Contents: Read and write; repository policies may also restrict access.');
    if(response.status===409||response.status===422)throw Error('The settings file changed or GitHub rejected the update. Reconnect to reload the latest version before saving.');
    throw Error('GitHub request failed (HTTP '+response.status+').');
   }
   return response.json();
  }
  return {
   async connect(value){token=value.trim();try{const file=await request('GET');sha=file.sha;return decode(file.content)}catch(error){token='';sha='';throw error}},
   disconnect(){token='';sha=''},
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

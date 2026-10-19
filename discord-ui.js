'use strict';
const discordPanel=document.createElement('div');discordPanel.innerHTML='<button id="send-discord-test">Send Discord graph</button><p id="discord-send-status" class="note" role="status">Send the latest saved graph, totals and price changes to this collection’s Discord channel. No GitHub token or collection ownership required. One request per collection per minute.</p>';
$('copy-settings').parentElement.before(discordPanel);
let discordConfig;
async function sendDiscordGraph(collection,button,status){
 button.disabled=true;status.textContent='Sending saved graph to Discord…';
 try{
  if(!discordConfig){const r=await fetch('./supabase-config.json',{cache:'no-store'});if(!r.ok)throw Error('Supabase configuration unavailable.');discordConfig=await r.json()}
  const response=await fetch(discordConfig.url+'/functions/v1/send-discord-summary',{method:'POST',headers:{apikey:discordConfig.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({collection}),redirect:'error'});
  let result;try{result=await response.json()}catch{throw Error('Discord function is not deployed yet.')}
  if(!response.ok||!result.sent)throw Error(result.error||result.message||'Discord delivery failed.');
  status.textContent='Graph sent to Discord'+(result.checkedAt?' · saved prices checked '+new Date(result.checkedAt).toLocaleString():'')+'.';
 }catch(e){status.textContent=e.message}finally{button.disabled=false}
}
$('send-discord-test').onclick=()=>sendDiscordGraph(profile,$('send-discord-test'),$('discord-send-status'));
// Public send controls are also available without signing in to collection data.
const publicDiscord=document.createElement('div');publicDiscord.innerHTML='<hr><p class="note">Send a saved graph to Discord without signing in:</p><div class="controls"><button id="discord-public-main">Send Joe’s graph</button><button id="discord-public-jacob">Send Jacob’s graph</button></div><p id="discord-public-status" class="note" role="status"></p>';$('cloud-login').append(publicDiscord);
for(const collection of ['main','jacob'])$('discord-public-'+collection).onclick=()=>sendDiscordGraph(collection,$('discord-public-'+collection),$('discord-public-status'));
const manualControls=$('copy-settings').parentElement,manualInstructions=manualControls.nextElementSibling;
const manual=document.createElement('details'),manualTitle=document.createElement('summary');manualTitle.textContent='Download or copy settings backup';manual.append(manualTitle);manualControls.before(manual);manual.append(manualControls);
if(manualInstructions?.tagName==='P'){manualInstructions.textContent='Backups contain this collection’s settings. Changes save automatically to Supabase.';manual.append(manualInstructions)}
document.querySelectorAll('section').forEach(section=>{if(section.querySelector('#watchlist'))section.querySelector('p.note').textContent='Settings save to Supabase automatically. Discord checks use saved settings twice daily. Only this collection’s owner can edit settings; anyone can request a saved Discord graph.'});

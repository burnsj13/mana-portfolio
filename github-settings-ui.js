'use strict';
// GitHub only dispatches the one-time Discord test. Supabase owns saved data.
const githubWriter=GitHubSettings.create(profile);
const connectPanel=document.createElement('div');connectPanel.id='github-settings-panel';
connectPanel.innerHTML=`<details id="github-connect"><summary>Connect GitHub for the one-time Discord test</summary><p class="note">Use a short-lived fine-grained token scoped to mana-portfolio with Actions: Read and write. Set resource owner to burnsj13 and repository access to Only select repositories → mana-portfolio. It is sent only to api.github.com and stays in tab memory. Refresh or disconnect clears it. Supabase handles collection and wishlist saves.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a repository-scoped token ↗</a><label>GitHub token<input type="password" id="github-token" autocomplete="off" spellcheck="false"></label><div class="controls"><button id="github-connect-button">Connect</button><button id="github-disconnect">Disconnect</button></div><p id="github-status" class="note" role="status">No GitHub credential is needed to browse or save collection data.</p></details><button id="send-discord-test">Send one-time Discord graph</button><p class="note">Starts a price-refresh workflow and sends a graph for the collection on this page. Regular Discord checks continue twice daily.</p>`;
$('copy-settings').parentElement.before(connectPanel);
$('github-connect-button').onclick=async()=>{
 const token=$('github-token').value;$('github-token').value='';$('github-connect-button').disabled=true;
 try{await githubWriter.connectDiscord(token);$('github-status').textContent='Connected for this tab. You can request a one-time Discord graph.'}catch(e){githubWriter.disconnect();$('github-status').textContent=e.message}finally{$('github-connect-button').disabled=false}
};
$('github-disconnect').onclick=()=>{githubWriter.disconnect();$('github-token').value='';$('github-status').textContent='Disconnected. Token cleared.'};
$('send-discord-test').onclick=async()=>{
 const button=$('send-discord-test');button.disabled=true;
 try{await githubWriter.sendDiscordTest();$('github-status').textContent='Graph requested for this collection. Delivery follows the price-refresh workflow and can take several minutes.'}catch(e){$('github-status').textContent=e.message;$('github-connect').open=true}finally{button.disabled=false}
};
const manualControls=$('copy-settings').parentElement,manualInstructions=manualControls.nextElementSibling;
const manual=document.createElement('details'),manualTitle=document.createElement('summary');manualTitle.textContent='Download or copy settings backup';manual.append(manualTitle);manualControls.before(manual);manual.append(manualControls);
$('publish-settings').hidden=true;$('discard-settings').hidden=true;
if(manualInstructions?.tagName==='P'){manualInstructions.textContent='Backups contain this collection’s settings. Changes save automatically to Supabase.';manual.append(manualInstructions)}
document.querySelectorAll('section').forEach(section=>{if(section.querySelector('#watchlist'))section.querySelector('p.note').textContent='Settings save to Supabase automatically. Discord checks use saved settings twice daily. Only this collection’s owner can edit.'});

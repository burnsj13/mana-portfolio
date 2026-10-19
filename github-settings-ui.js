'use strict';
const githubWriter=GitHubSettings.create(profile);
const connectPanel=document.createElement('div');
connectPanel.id='github-settings-panel';
connectPanel.innerHTML=`<details id="github-connect"><summary>Connect GitHub to save directly</summary><p class="note">Use a short-lived fine-grained personal access token for <strong>only mana-portfolio</strong>, with <strong>Contents: Read and write</strong>. For the Discord test button, also allow <strong>Actions: Read and write</strong>. You must have write access to this repository. The token is sent only to api.github.com and kept in this tab’s memory. It is never saved in settings or browser storage. Refreshing or disconnecting clears it.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a repository-scoped token on GitHub ↗</a><label>GitHub token<input type="password" id="github-token" autocomplete="off" spellcheck="false" placeholder="Fine-grained token for this repository"></label><div class="controls"><button id="github-connect-button">Connect</button><button id="github-disconnect">Disconnect</button></div><p id="github-status" class="note" role="status">Not connected. No credential is required to browse.</p></details><div class="controls"><button id="save-github">Save directly to GitHub</button><button id="send-discord-test">Send one-time Discord graph</button><button id="reload-github-settings">Load latest published settings</button></div><p class="note">Save creates or updates this collection’s tracked settings file and triggers price collection automatically. No manual file editing or git push is required after saving. The controls below remain available for backups.</p>`;
$('copy-settings').parentElement.before(connectPanel);
const manualControls=$('copy-settings').parentElement;
const manualInstructions=manualControls.nextElementSibling;
const manual=document.createElement('details'),manualTitle=document.createElement('summary');
manualTitle.textContent='Manual backup / advanced publishing';manual.append(manualTitle);manualControls.before(manual);manual.append(manualControls);
if(manualInstructions?.tagName==='P')manual.append(manualInstructions);
$('github-connect-button').onclick=async()=>{
 const token=$('github-token').value;$('github-token').value='';$('github-connect-button').disabled=true;
 try{const remote=await githubWriter.connect(token);if(!remote.alerts||!Array.isArray(remote.watchlist))throw Error('The published settings file is invalid.');publishedSettings=remote;initializeSettings(remote,true);$('github-status').textContent='Connected for this tab. Save directly to GitHub creates the settings commit for you; write permission is checked when saving.'}catch(error){githubWriter.disconnect();$('github-status').textContent=error.message}finally{$('github-connect-button').disabled=false}
};
$('github-disconnect').onclick=()=>{githubWriter.disconnect();$('github-token').value='';$('github-status').textContent='Disconnected. The token has been cleared from this tab.'};
$('send-discord-test').onclick=async()=>{
 const button=$('send-discord-test');button.disabled=true;
 try{await githubWriter.sendDiscordTest();$('github-status').textContent='One-time Discord graph requested for this collection. It will be sent after the GitHub workflow refreshes prices; this can take several minutes.'}catch(error){$('github-status').textContent=error.message;$('github-connect').open=true}finally{button.disabled=false}
};
$('save-github').onclick=async()=>{
 if(profile==='jacob')settings.watchlist=[];if(!saveDraft())return;
 const button=$('save-github');button.disabled=true;
 try{await githubWriter.save(settings);publishedSettings=JSON.parse(JSON.stringify(settings));localStorage.removeItem(draftKey);$('settings-status').textContent='Saved to GitHub. Price collection and deployment now run automatically; wishlist prices appear when the workflow finishes.';$('github-status').textContent='Settings commit created successfully. No manual git push is required.';renderWatchlist()}catch(error){$('settings-status').textContent=error.message;$('github-connect').open=true}finally{button.disabled=false}
};
$('reload-github-settings').onclick=async()=>{
 try{const response=await fetch(`https://api.github.com/repos/burnsj13/mana-portfolio/contents/settings/${profile}.json?ref=main`,{headers:{Accept:'application/vnd.github+json'},redirect:'error'});if(!response.ok)throw Error('Could not load published settings.');const file=await response.json(),remote=GitHubSettings.decode(file.content);if(!remote.alerts||!Array.isArray(remote.watchlist))throw Error('Invalid settings file');publishedSettings=remote;initializeSettings(remote,true);$('settings-status').textContent='Latest published settings loaded; local drafts are preserved. Reconnect before saving if the remote file changed.'}catch(error){$('settings-status').textContent=error.message}
};
// Keep the default flow focused on the save button, while retaining manual backups.
document.querySelectorAll('section').forEach(section=>{if(section.querySelector('#watchlist')){const text=section.querySelector('p.note');text.textContent=profile==='jacob'?'Discord alerts for Jacob’s collection. Use Send one-time Discord graph to test this destination. GitHub connection is required to save alert settings or start a test.':'Separate alert and wishlist settings for this collection. Save directly to GitHub publishes changes without editing files or running git push. Unsaved changes remain local drafts.'}});

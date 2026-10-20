'use strict';
const profile=document.documentElement.dataset.collection==='jacob'?'jacob':'main';
const draftKey='mana-settings-'+profile;
let settings={version:1,alerts:{enabled:true,percent:10,dollars:1,period:'day',direction:'both',dailySummary:false},watchlist:[]},publishedSettings=null,watchState={cards:[],prices:{},history:[]},searchResults=[];
const signedMoney=v=>(v>=0?'+':'−')+money(Math.abs(v));
const signedPercent=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(2)+'%';
function currentEnd(){return {...state.latest,date:state.latest.lastUpdated.slice(0,10),timestamp:state.latest.lastUpdated,items:state.cards.filter(c=>c.proxy!=='true').map(c=>[c.id,c.f,c.q,c.binder,unit(c)])}}
function movement(cards,prices,history,end,period){return Market.rows(cards,prices,history,end,period)}
function moveList(rows){return rows.length?rows.slice(0,8).map(r=>`<div class="move-row"><div><strong>${esc(r.n)}</strong><div class="note">${esc(r.f)} · ${r.q} copies · ${r.compatible?'Matching source':'Mixed-source estimate'}</div></div><div class="${r.dollars>=0?'up':'down'}">${signedMoney(r.dollars)} / card · ${signedPercent(r.percent)}<div class="note">Holdings: ${signedMoney(r.holdingDollars)}</div></div>${Market.spark(state.history,r,currentEnd(),$('trend-period').value)}</div>`).join(''):'<p class="note">No qualifying price changes in the available data.</p>'}
function renderInsights(){
 if(!state.latest.lastUpdated)return;
 const end=currentEnd(),selectedCards=state.cards.filter(c=>matches(c,unit(c))),today=movement(selectedCards,state.prices,state.history,end,'day');
 let delta=0,baseline=0,quantity=0;
 for(const r of today.rows){delta+=r.holdingDollars;baseline+=(r.price-r.dollars)*r.q;quantity+=r.q}
 $('today-dollars').textContent=today.rows.length?signedMoney(delta):'—';$('today-percent').textContent=baseline>0?signedPercent(delta/baseline*100):'—';$('today-coverage').textContent=quantity.toLocaleString();$('today-baseline').textContent=today.base?.date||'Not available';
 const period=$('trend-period').value;const result=movement(selectedCards,state.prices,state.history,end,period);const rows=result.rows;
 $('trend-note').textContent=result.base?`Compared with ${result.base.timestamp?new Date(result.base.timestamp).toLocaleString():result.base.date}. Latest: ${new Date(end.timestamp).toLocaleString()}. `+(Market.source(end)!==Market.source(result.base)?'Sources differ: figures are estimates and are excluded from alerts.':'Matching price source.'):'No earlier snapshot available for this period.';
 $('gainers').innerHTML=moveList(rows.filter(r=>r.dollars>0).sort((a,b)=>b.holdingDollars-a.holdingDollars));$('losers').innerHTML=moveList(rows.filter(r=>r.dollars<0).sort((a,b)=>a.holdingDollars-b.holdingDollars));
 renderAlertPreview();renderWatchlist();
}
function readRule(){return {enabled:$('alerts-enabled').value==='true',percent:Number($('alert-percent').value),dollars:Number($('alert-dollars').value),period:$('alert-period').value,direction:$('alert-direction').value,dailySummary:$('daily-summary').checked,watchPercent:Number($('watch-percent').value),watchDirection:$('watch-direction').value}}
function saveDraft(){const rule=readRule();if(!Number.isFinite(rule.watchPercent)||rule.watchPercent<.1||rule.watchPercent>10000||!Number.isFinite(rule.percent)||rule.percent<.1||rule.percent>10000||!Number.isFinite(rule.dollars)||rule.dollars<0||rule.dollars>100000){$('settings-status').textContent='Enter a percentage of at least 0.1 and a dollar threshold of 0 or more.';return false}settings.alerts=rule;try{localStorage.setItem(draftKey,JSON.stringify(settings));$('settings-status').textContent='Saving settings…'}catch{$('settings-status').textContent='Browser storage unavailable. Copy or download your settings before leaving.'}renderInsights();if(window.cloudSettingsChanged)window.cloudSettingsChanged();return true}
function renderAlertPreview(){
 const end=currentEnd(),owned=movement(state.cards,state.prices,state.history,end,settings.alerts.period);
 let candidates=owned.rows.filter(r=>Market.qualifies(r,settings.alerts));
 candidates=candidates.concat(watchMovements().filter(r=>Market.qualifies(r,{...settings.alerts,percent:settings.alerts.watchPercent??settings.alerts.percent,dollars:0,direction:settings.alerts.watchDirection||'both'})));
 const unique=[...new Map(candidates.map(r=>[(r.scope||'collection')+'|'+Market.key(r),r])).values()];$('alert-events').innerHTML=unique.length?unique.slice(0,12).map(r=>`<p class="${r.dollars>0?'up':'down'}">${esc(r.n)} · ${signedMoney(r.dollars)} / card · ${signedPercent(r.percent)}${r.scope==='wishlist'?' · since added':''}</p>`).join(''):'<p class="note">No matching alert conditions in the saved data. New tracking may need an earlier matching-source snapshot.</p>';
}
function watchEntries(){return settings.watchlist.map(c=>{const tracked=watchState.cards.find(w=>Market.key(w)===Market.key(c)&&(!c.addedAt||w.addedAt===c.addedAt));return {...c,baseline:c.baseline||tracked?.baseline,tracked:!!tracked}})}
function watchMovements(){return Market.watchRows(watchEntries().filter(c=>c.tracked),watchState.prices,watchState)}
function renderWatchlist(){
 const saved=new Set((publishedSettings?.watchlist||[]).map(Market.key)),moves=new Map(watchMovements().map(c=>[Market.key(c),c]));
 $('watchlist').innerHTML=watchEntries().map((c,i)=>{const base=c.baseline,trend=moves.get(Market.key(c));return `<div class="move-row"><div><strong>${esc(c.n)}</strong><div class="note">${esc(c.setName||c.set||'Exact printing')} · ${esc(c.f)} · ${saved.has(Market.key(c))?'Saved':'Saving'}</div><div class="note">${base?'Starting price: '+money(base.price)+' · '+esc(new Date(base.timestamp).toLocaleString())+' · '+esc(base.source):'Starting price pending: first available quote will be saved.'}</div></div><span>${trend?money(trend.price):base?money(base.price)+' when added':'Awaiting price collection'}<div class="note">${trend?signedMoney(trend.dollars)+' · '+signedPercent(trend.percent)+' since added'+(trend.compatible?'':' · mixed sources, no alert'):'Awaiting first background comparison'}</div></span><button data-watch-history="${i}">History</button><button data-remove-watch="${i}" ${cloudWritable?'':'disabled'} aria-label="Remove ${esc(c.n)} from wishlist">Remove</button></div>`}).join('')||'<p class="note">No wishlist cards yet.</p>';
 document.querySelectorAll('[data-remove-watch]').forEach(b=>b.onclick=()=>{if(!cloudWritable)return;settings.watchlist.splice(Number(b.dataset.removeWatch),1);saveDraft()});
}
const pendingWatchAdds=new Set();
async function addWatch(card){
 if(!cloudWritable){$('settings-status').textContent='Only this collection’s owner can edit the wishlist.';return}
 const key=Market.key(card);
 if(settings.watchlist.some(c=>Market.key(c)===key)||pendingWatchAdds.has(key)){$('settings-status').textContent='That printing and finish are already added or being added.';return}
 if(settings.watchlist.length>=200){$('settings-status').textContent='This wishlist supports up to 200 printings.';return}
 pendingWatchAdds.add(key);$('settings-status').textContent='Fetching the starting price…';
 try{
  const entry=await Market.watchEntry(card);
  if(settings.watchlist.length>=200)throw Error('Wishlist maximum reached.');
  settings.watchlist.push(entry);saveDraft();
 }catch(e){$('settings-status').textContent=e.message}finally{pendingWatchAdds.delete(key)}
}
$('trend-period').onchange=renderInsights;
for(const id of ['alerts-enabled','alert-period','alert-direction','alert-percent','alert-dollars','daily-summary','watch-percent','watch-direction'])$(id).onchange=saveDraft;
$('watch-add').onclick=()=>{const id=$('watch-id').value.trim(),n=$('watch-name').value.trim();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!n){$('settings-status').textContent='Enter a card name and valid Scryfall UUID.';return}addWatch({id:id.toLowerCase(),n,f:$('watch-finish').value})};
$('watch-find').onclick=async()=>{
 const query=$('watch-search').value.trim();if(query.length<3){$('watch-results').textContent='Enter at least three characters.';return}
 $('watch-find').disabled=true;$('watch-results').textContent='Finding exact printings…';
 try{const response=await fetch('https://api.scryfall.com/cards/search?unique=prints&q='+encodeURIComponent('('+query+') game:paper'),{headers:{Accept:'application/json'}});if(!response.ok)throw Error('Search unavailable or no cards found. Try the manual Scryfall ID option.');const data=await response.json();searchResults=data.data.slice(0,20);$('watch-results').innerHTML=searchResults.map((c,i)=>`<div class="move-row"><div>${esc(c.name)}<div class="note">${esc(c.set_name)} · #${esc(c.collector_number)}</div></div><select aria-label="Finish for ${esc(c.name)}" id="result-finish-${i}">${(c.finishes||['nonfoil']).map(f=>`<option value="${f==='nonfoil'?'normal':esc(f)}">${esc(f)}</option>`).join('')}</select><button data-add-result="${i}">Add</button></div>`).join('')+(data.has_more||data.data.length>20?'<p>Showing the first 20 results. Refine the name or add a set code to narrow results.</p>':'');document.querySelectorAll('[data-add-result]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.addResult),c=searchResults[i];addWatch({id:c.id,n:c.name,f:$('result-finish-'+i).value,set:c.set.toUpperCase(),setName:c.set_name})})}catch(e){$('watch-results').textContent=e.message}finally{$('watch-find').disabled=false}
};
$('copy-settings').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(settings,null,2));$('settings-status').textContent='Settings backup copied.'}catch{$('settings-status').textContent='Clipboard unavailable; use Download settings instead.'}};
$('export-settings').onclick=()=>{if(!saveDraft())return;const url=URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=profile+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
function initializeSettings(value,restore=true){settings=JSON.parse(JSON.stringify(value));if(restore){try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft?.version===1&&Array.isArray(draft.watchlist)&&draft.alerts)settings=draft}catch{}}
 for(const [id,key] of [['alerts-enabled','enabled'],['alert-period','period'],['alert-direction','direction'],['alert-percent','percent'],['alert-dollars','dollars']])$(id).value=String(settings.alerts[key]);$('daily-summary').checked=!!settings.alerts.dailySummary;$('watch-percent').value=String(settings.alerts.watchPercent??settings.alerts.percent);$('watch-direction').value=settings.alerts.watchDirection||'both';
 $('settings-status').textContent=JSON.stringify(settings)!==JSON.stringify(publishedSettings)?'Local draft has unsaved changes.':'Settings loaded from Supabase. Changes save automatically.';renderInsights();
}
async function loadExtras(){
 if(loadExtras.busy)return;loadExtras.busy=true;

 try{const response=await window.portfolioFetch(`${dataPath}/wishlist/latest.json`,{cache:'no-store'});if(response.ok){watchState={...await response.json(),history:[]};const indexResponse=await window.portfolioFetch(`${dataPath}/wishlist/history-index.json`,{cache:'no-store'});if(indexResponse.ok){const index=await indexResponse.json();if(!index.files.every(f=>/^history\/\d{4}-\d{2}\.json$/.test(f)))throw Error('Invalid wishlist history index');const archives=await Promise.all(index.files.map(async f=>{const r=await window.portfolioFetch(`${dataPath}/wishlist/${f}`,{cache:'no-store'});if(!r.ok)throw Error('Wishlist history unavailable');return r.json()}));watchState.history=archives.flatMap(a=>a.snapshots.map(h=>h.layout==null?h:{...h,rowLayout:a.layouts[h.layout]})).sort((a,b)=>(a.timestamp||a.date).localeCompare(b.timestamp||b.date))}}}catch{$('settings-status').textContent+=' Wishlist history is unavailable.'}
 try{const r=await window.portfolioFetch(`${dataPath}/alert-status.json`,{cache:'no-store'});if(r.ok){const status=await r.json();$('alerts-status').textContent=`Last background check: ${new Date(status.checkedAt).toLocaleString()}. Discord ${status.deliveryConfigured?'webhook configured':'not configured: add '+(profile==='jacob'?'DISCORD_WEBHOOK_JACOB':'DISCORD_WEBHOOK_MAIN')+' in GitHub Actions secrets'}.`+(status.deliveryError?' Delivery failed: '+status.deliveryError:status.delivered?' Last check sent a message.':status.reason?' No message sent: '+status.reason+'.':' No qualifying alerts or summary requested.')}}catch{}
 renderInsights();loadExtras.busy=false;
}
window.addEventListener('portfolio-ready',()=>{renderInsights();loadExtras()});if(state.latest.lastUpdated)renderInsights();

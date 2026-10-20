'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={cards:[],prices:{},history:[],metadata:{},latest:{},sort:'value',direction:-1,page:0,range:'ALL',points:[],hover:0};
const size=100;
const dataPath=document.documentElement.dataset.collection==='jacob'?'./data/jacob':'./data';
function unit(c,prices=state.prices){const p=prices[c.id]||{};const v=p[{foil:'usd_foil',etched:'usd_etched'}[c.f]||'usd'];return v==null?null:Number(v)}
function info(c){return {...c,...state.metadata[c.id]}}
function filters(){return {binder:$('binder').value,set:$('set').value,color:$('color').value,type:$('type').value,min:Number($('minimum').value)}}
function matches(c,p,f=filters()){
 if(c.proxy==='true')return false;
 const m=info(c);const colors=m.colors;const types=m.types;
 return (!f.binder||c.binder===f.binder)&&(!f.set||c.set===f.set)&&(!f.color||(Array.isArray(colors)&&(f.color==='C'?colors.length===0:colors.includes(f.color))))&&(!f.type||(types||[]).includes(f.type))&&(!f.min||(p!=null&&p>f.min));
}
function filteredActive(){const f=filters();return !!(f.binder||f.set||f.color||f.type||f.min)}
function options(id,entries){const selected=$(id).value;$(id).innerHTML=$(id).options[0].outerHTML+entries.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');$(id).value=selected}
function initializeFilters(){
 options('binder',[...new Set(state.cards.map(c=>c.binder).filter(Boolean))].sort().map(s=>[s,s]));
 const sets=new Map(state.cards.map(c=>[c.set,c.setName||c.set]));options('set',[...sets].sort((a,b)=>a[1].localeCompare(b[1])).map(([s,n])=>[s,`${n} (${s})`]));
 options('type',[...new Set(Object.values(state.metadata).flatMap(m=>m.types||[]))].sort().map(s=>[s,s]));
}
function overview(){
 $('comparison-note').textContent='Change % since this collection’s first saved snapshot ('+(state.history[0]?.date||'unavailable')+'), using per-card unit prices for the same printing and finish. Missing or zero baselines show —; different price sources can affect comparisons.';let total=0,basis=0,covered=0,count=0;for(const c of state.cards){if(c.proxy==='true')continue;count+=c.q;const p=unit(c);if(p!=null){total+=p*c.q;basis+=c.cost*c.q;covered+=c.q}}
 $('total').textContent=covered?money(total):'—';$('basis').textContent=money(basis);$('difference').textContent=money(total-basis);$('difference').className=total>=basis?'up':'down';$('count').textContent=count.toLocaleString();$('coverage').textContent=`${covered.toLocaleString()} / ${count.toLocaleString()} cards priced`;
 const latest=state.latest;const prior=state.history[0];$('daily').textContent=prior?money(total-prior.value):'—';
 $('updated').textContent=`Checked ${new Date(latest.lastUpdated).toLocaleString()} · ${latest.source||'Scryfall USD'} · prices as of ${latest.priceAsOf||latest.lastUpdated.slice(0,10)}`;
}
function historyItems(snapshot){
 if(snapshot?.items)return snapshot.items;
 return snapshot?.rowLayout?snapshot.rowLayout.map((row,i)=>[...row,snapshot.unitPrices[i]]):null;
}
async function loadHistory(){
 const response=await window.portfolioFetch(`${dataPath}/history-index.json`,{cache:'no-store'});
 if(response.status===404){const legacy=await window.portfolioFetch(`${dataPath}/history.json`,{cache:'no-store'});if(!legacy.ok)throw Error('History unavailable');state.historyArchives=null;return legacy.json()}
 if(!response.ok)throw Error('History index unavailable');
 const index=await response.json();
 if(index.version!==1||!index.files.every(name=>/^history\/\d{4}-\d{2}\.json$/.test(name)))throw Error('Invalid history index');
 const archives=await Promise.all(index.files.map(async name=>{const r=await window.portfolioFetch(`${dataPath}/${name}`,{cache:'no-store'});if(!r.ok)throw Error('History month unavailable: '+name);return r.json()}));
 state.historyArchives=archives;
 return archives.flatMap(archive=>archive.snapshots.map(h=>{if(h.layout==null)return h;const rows=archive.layouts[h.layout];if(!rows||rows.length!==h.unitPrices.length)throw Error('Invalid history layout');return {...h,rowLayout:rows}})).sort((a,b)=>(a.timestamp||a.date).localeCompare(b.timestamp||b.date));
}
function changeFor(card){
 const current=unit(card);if(current==null)return null;
 const snapshot=state.history[0];
 if(!state.baselinePrices||state.baselineSnapshot!==snapshot){state.baselineSnapshot=snapshot;state.baselinePrices=new Map((historyItems(snapshot)||[]).filter(i=>i[4]!=null).map(i=>[i[0]+'|'+i[1],i]));}
 const item=state.baselinePrices.get(card.id+'|'+card.f);
 if(!item||Number(item[4])<=0)return null;
 return {value:(current-Number(item[4]))/Number(item[4])*100,label:'Since first saved snapshot: '+snapshot.date+' · '+snapshot.source};
}
function dailyFor(card){
 if(state.dailyCacheVersion!==state.latest){
  const end={date:state.latest.lastUpdated.slice(0,10),timestamp:state.latest.lastUpdated,source:state.latest.source};
  const result=Market.rows(state.cards,state.prices,state.history,end,'day');state.dailyCache=new Map(result.rows.map(r=>[Market.key(r),{...r,date:result.base.date}]));state.dailyCacheVersion=state.latest;
 }
 return state.dailyCache.get(Market.key(card));
}
function renderTable(){
 hidePreview();
 const search=$('search').value.toLowerCase();let rows=state.cards.filter(c=>matches(c,unit(c))).filter(c=>[c.n,c.binder,c.set,c.setName,info(c).type].join(' ').toLowerCase().includes(search));
 function key(c){const p=unit(c);switch(state.sort){case 'unit':return p;case 'value':return p==null?null:p*c.q;case 'dayDollars':return dailyFor(c)?.dollars??null;case 'dayPercent':return dailyFor(c)?.percent??null;case 'change':return changeFor(c)?.value??null;case 'gain':return p==null?null:(p-c.cost)*c.q;default:return c[state.sort]??''}}
 rows.sort((a,b)=>{const x=key(a),y=key(b);if(x==null)return y==null?0:1;if(y==null)return -1;return state.direction*(typeof x==='number'?x-y:String(x).localeCompare(String(y)))||a.n.localeCompare(b.n)});
 const pages=Math.max(1,Math.ceil(rows.length/size));state.page=Math.min(state.page,pages-1);const first=state.page*size;
 state.visibleRows=rows.slice(first,first+size);
 $('rows').innerHTML=state.visibleRows.map((c,i)=>{const p=unit(c),change=changeFor(c),daily=dailyFor(c);return `<tr><td><button class="card-name" data-card="${i}" aria-haspopup="dialog">${esc(c.n)}</button><div class="sub">${esc(c.f)} · ${esc(info(c).type||'Type unavailable')}</div></td><td>${esc(c.binder||'Unassigned')}<div class="sub">${esc(c.binderType||'')}</div></td><td>${esc(c.setName||c.set)}<div class="sub">${esc(c.set)}</div></td><td>${c.q}</td><td>${p==null?'—':money(p)}</td><td>${p==null?'—':money(p*c.q)}</td><td>${p==null?'—':money((p-c.cost)*c.q)}</td><td title="${esc(change?.label||'No usable comparison price')}" class="${change?(change.value>=0?'up':'down'):''}">${change?(change.value>=0?'+':'')+change.value.toFixed(2)+'%':'—'}</td><td title="${esc(daily?'Compared with '+daily.date+(daily.compatible?'':' · Mixed-source estimate'):'No comparison price')}">${daily?(daily.dollars>=0?'+':'−')+money(Math.abs(daily.dollars))+(daily.compatible?'':' †'):'—'}</td><td title="${esc(daily?.compatible?'Matching source':'Mixed sources or unavailable')}">${daily?.percent!=null?(daily.percent>=0?'+':'')+daily.percent.toFixed(2)+'%'+(daily.compatible?'':' †'):'—'}</td><td><button data-history="${i}" aria-label="Price history for ${esc(c.n)}">Chart</button></td></tr>`}).join('');
 $('shown').textContent=rows.length?`Showing ${first+1}–${Math.min(first+size,rows.length)} of ${rows.length.toLocaleString()} matching entries`:'No matching entries';$('page').textContent=`Page ${state.page+1} of ${pages}`;$('previous').disabled=state.page===0;$('next').disabled=state.page===pages-1;
 document.querySelectorAll('[data-sort]').forEach(b=>{b.textContent=b.dataset.label+(b.dataset.sort===state.sort?(state.direction===1?' ↑':' ↓'):'');b.parentElement.setAttribute('aria-sort',b.dataset.sort===state.sort?(state.direction===1?'ascending':'descending'):'none')});
}
function graphData(){
 const active=filteredActive(),byId=new Map(state.cards.map(c=>[c.id,c]));let unsupported=0;
 const points=state.history.flatMap(h=>{
  const time=Date.parse(h.timestamp||h.date+'T12:00:00Z');if(state.range!=='ALL'&&time<Date.now()-Number(state.range)*86400000)return [];
  if(!active)return [{...h,time,plot:$('metric').value==='count'?h.quantity:h.value}];
  let items=historyItems(h);
  if(!items&&h.timestamp===state.latest.lastUpdated)items=state.cards.filter(c=>c.proxy!=='true').map(c=>[c.id,c.f,c.q,c.binder,unit(c)]);
  if(!items){unsupported++;return []}
  let value=0,quantity=0,covered=0;
  for(const [id,finish,q,binder,p] of items){const card={...(byId.get(id)||{id,n:'',set:''}),f:finish,q,binder};if(!matches(card,p==null?null:Number(p)))continue;quantity+=q;if(p!=null){value+=Number(p)*q;covered+=q}}
  return [{...h,time,value,quantity,covered,plot:$('metric').value==='count'?quantity:value}];
 });
 return {points:points.sort((a,b)=>a.time-b.time),unsupported};
}
function draw(){
 const {points,unsupported}=graphData();state.points=points;const svg=$('chart');
 $('filter-summary').textContent=(filteredActive()?'Filtered view':'All non-proxy cards')+(unsupported?` · ${unsupported} older observation(s) omitted because card-level prices were not saved.`:'')+' · Color/type filters exclude entries without metadata.';
 if(!points.length){svg.innerHTML='<text x="60" y="130" fill="#a3b3c9">No history available for this date range.</text>';$('tip').textContent='Try a wider range or another filter.';return}
 const vals=points.map(p=>p.plot),min=Math.min(...vals),max=Math.max(...vals),pad=(max-min||Math.max(max*.05,1))*.15,low=Math.max(0,min-pad),high=max+pad;
 const x=t=>70+(points.length===1?350:(t-points[0].time)/(points.at(-1).time-points[0].time||1)*700),y=v=>238-(v-low)/(high-low||1)*210;
 state.geometry={x,y};const metric=$('metric').value;const axis=v=>metric==='count'?Math.round(v).toLocaleString():money(v);
 svg.innerHTML=Array.from({length:5},(_,i)=>{const v=low+(high-low)*i/4;return `<line x1="70" y1="${y(v)}" x2="770" y2="${y(v)}" stroke="#293b53"/><text x="62" y="${y(v)+4}" text-anchor="end" fill="#a3b3c9" font-size="11">${axis(v)}</text>`}).join('')+`<polyline points="${points.map(p=>`${x(p.time)},${y(p.plot)}`).join(' ')}" fill="none" stroke="#68e4b7" stroke-width="3" stroke-linejoin="round"/><text x="70" y="275" fill="#a3b3c9" font-size="11">${points[0].date}</text><text x="770" y="275" text-anchor="end" fill="#a3b3c9" font-size="11">${points.at(-1).date}</text><g id="hover-layer"></g>`;
 state.hover=points.length-1;inspect(state.hover);
}
function inspect(index){
 const p=state.points[index];if(!p)return;state.hover=index;const {x,y}=state.geometry,cx=x(p.time),cy=y(p.plot),boxX=Math.max(74,Math.min(540,cx-105)),boxY=cy<104?cy+18:cy-82;
 const date=p.timestamp?new Date(p.timestamp).toLocaleString():p.date;const value=$('metric').value==='count'?`${p.quantity.toLocaleString()} cards`:money(p.value);
 $('hover-layer').innerHTML=`<line x1="${cx}" y1="25" x2="${cx}" y2="240" stroke="#8da2bb" stroke-dasharray="4 4"/><circle cx="${cx}" cy="${cy}" r="6" fill="#68e4b7" stroke="#090f1d" stroke-width="3"/><rect x="${boxX}" y="${boxY}" width="228" height="65" rx="9" fill="#090f1d" stroke="#5379e8"/><text x="${boxX+12}" y="${boxY+22}" fill="#a3b3c9" font-size="11">${esc(date)}</text><text x="${boxX+12}" y="${boxY+47}" fill="#f0f5ff" font-size="17" font-weight="700">${esc(value)}</text>`;
 $('tip').textContent=`${date} · ${money(p.value)} · ${p.covered}/${p.quantity} cards priced · ${p.source||'Saved snapshot'}`;
}
function refreshViews(){state.page=0;draw();renderTable();window.dispatchEvent(new Event('portfolio-ready'))}
async function load(){
 $('reload').disabled=true;try{
  const urls=['latest','metadata'];const responses=await Promise.all(urls.map(n=>window.portfolioFetch(`${dataPath}/${n}.json`,{cache:'no-store'})));
  if(!responses[0].ok)throw Error('Published price files could not be loaded');
  const latest=await responses[0].json(),history=await loadHistory(),metadata=responses[1].ok?await responses[1].json():{};
  Object.assign(state,{cards:latest.cards,prices:latest.prices,history,metadata,latest});await window.loadCloudHoldings();initializeFilters();overview();refreshViews();
  const savedPrintings=new Set(latest.cards.map(Market.key)),pending=new Set(state.cards.filter(c=>c.proxy!=='true'&&!savedPrintings.has(Market.key(c))&&unit(c)==null).map(Market.key));
  $('status').textContent=(pending.size?`${pending.size} new card printing(s) await the next successful price check. `:'Saved prices loaded. ')+`Last check: ${new Date(latest.lastUpdated).toLocaleString()}. Reload reads saved data; it does not request new provider prices.`;
 }catch(e){$('status').textContent='Could not load dashboard: '+e.message}finally{$('reload').disabled=false}
}
$('reload').onclick=load;
for(const id of ['binder','set','color','type','minimum'])$(id).onchange=refreshViews;
$('metric').onchange=draw;$('search').oninput=()=>{state.page=0;renderTable()};
function reset(){for(const id of ['binder','set','color','type'])$(id).value='';$('minimum').value='0';$('search').value=''}
$('reset').onclick=()=>{reset();refreshViews()};
document.querySelectorAll('[data-sort]').forEach(b=>{b.dataset.label=b.textContent.replace(/ [↑↓]$/,'');b.onclick=()=>{if(state.sort===b.dataset.sort)state.direction*=-1;else{state.sort=b.dataset.sort;state.direction=['q','unit','value','gain','change','dayDollars','dayPercent'].includes(state.sort)?-1:1}state.page=0;renderTable()}});
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{state.range=b.dataset.range;document.querySelectorAll('[data-range]').forEach(z=>z.classList.toggle('active',z===b));draw()});
$('previous').onclick=()=>{state.page--;renderTable()};$('next').onclick=()=>{state.page++;renderTable()};
$('chart').onpointermove=$('chart').onpointerdown=e=>{if(!state.points.length)return;const rect=$('chart').getBoundingClientRect(),position=(e.clientX-rect.left)/rect.width*800;let closest=0;state.points.forEach((p,i)=>{if(Math.abs(state.geometry.x(p.time)-position)<Math.abs(state.geometry.x(state.points[closest].time)-position))closest=i});inspect(closest)};
$('chart').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();inspect(Math.max(0,Math.min(state.points.length-1,state.hover+(e.key==='ArrowLeft'?-1:1))))};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...(state.historyArchives?{historyArchives:state.historyArchives}:{history:state.history}),...state.latest,metadata:state.metadata})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mana-portfolio-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

let previewTimer,closeTimer,previewAnchor=null;
function hidePreview(){clearTimeout(previewTimer);clearTimeout(closeTimer);$('card-preview').hidden=true;if(previewAnchor)previewAnchor.setAttribute('aria-expanded','false');previewAnchor=null}
function schedulePreviewClose(){clearTimeout(previewTimer);clearTimeout(closeTimer);closeTimer=setTimeout(hidePreview,200)}
function positionPreview(anchor){
 const panel=$('card-preview'),rect=anchor.getBoundingClientRect();
 const width=panel.offsetWidth,height=panel.offsetHeight;
 let left=rect.right+18;if(left+width>window.innerWidth-12)left=rect.left-width-18;
 left=Math.max(12,Math.min(left,window.innerWidth-width-12));
 panel.style.left=left+'px';panel.style.top=Math.max(12,Math.min(rect.top,window.innerHeight-height-12))+'px';
}
function showPreview(anchor){
 clearTimeout(previewTimer);clearTimeout(closeTimer);
 const card=state.visibleRows[Number(anchor.dataset.card)];if(!card)return;
 if(previewAnchor&&previewAnchor!==anchor)previewAnchor.setAttribute('aria-expanded','false');
 previewAnchor=anchor;anchor.setAttribute('aria-expanded','true');
 const metadata=info(card),p=unit(card),sid=card.id;
 const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid);
 const faces=metadata.faces||[];
 const details=faces.length?faces.map(face=>`<div class="preview-face"><h3>${esc(face.name)} <span class="sub">${esc(face.mana)}</span></h3><p class="sub">${esc(face.type)}</p><p class="rules">${esc(face.text||'No rules text.')}</p>${face.power!=null?`<p class="sub">Power / toughness: ${esc(face.power)} / ${esc(face.toughness)}</p>`:''}${face.loyalty!=null?`<p class="sub">Loyalty: ${esc(face.loyalty)}</p>`:''}</div>`).join(''):`<h3>${esc(card.n)}</h3><p>${esc(metadata.type||'Card details unavailable.')}</p>`;
 $('preview-content').innerHTML=`<div class="preview-layout"><div class="preview-art">${validId?`<img id="preview-image" src="https://cards.scryfall.io/normal/front/${sid[0]}/${sid[1]}/${sid}.jpg" alt="${esc(card.n)} card artwork" width="200" height="279"><p id="image-error" class="note" hidden>Image unavailable. Rules are shown alongside.</p>`:''}</div><div class="preview-details">${details}<p class="note">${esc(card.setName||card.set)} · ${esc(card.f)}<br>Collection: ${esc(card.binder||'Unassigned')} · ${card.q} ${card.q===1?'copy':'copies'}<br>Unit price: ${p==null?'Unpriced':money(p)}</p>${validId?`<a href="https://scryfall.com/card/${sid}" target="_blank" rel="noopener noreferrer">View printing on Scryfall ↗</a>`:''}</div></div>`;
 const panel=$('card-preview');panel.hidden=false;positionPreview(anchor);
 const image=$('preview-image');if(image)image.onerror=()=>{if($('preview-image')!==image||previewAnchor!==anchor)return;image.hidden=true;$('image-error').hidden=false;positionPreview(anchor)};
}
$('rows').addEventListener('pointerover',event=>{const anchor=event.target.closest('.card-name');if(!anchor||anchor.contains(event.relatedTarget))return;clearTimeout(closeTimer);clearTimeout(previewTimer);previewTimer=setTimeout(()=>showPreview(anchor),140)});
$('rows').addEventListener('pointerout',event=>{const anchor=event.target.closest('.card-name');if(anchor&&!anchor.contains(event.relatedTarget)&&!$('card-preview').contains(event.relatedTarget))schedulePreviewClose()});
$('rows').addEventListener('focusin',event=>{const anchor=event.target.closest('.card-name');if(anchor)showPreview(anchor)});
$('rows').addEventListener('focusout',event=>{if(!$('card-preview').contains(event.relatedTarget))schedulePreviewClose()});
$('rows').addEventListener('click',event=>{const anchor=event.target.closest('.card-name');if(anchor)showPreview(anchor)});
$('card-preview').addEventListener('pointerenter',()=>clearTimeout(closeTimer));
$('card-preview').addEventListener('pointerleave',schedulePreviewClose);
$('card-preview').addEventListener('focusin',()=>clearTimeout(closeTimer));
$('card-preview').addEventListener('focusout',event=>{if(!$('card-preview').contains(event.relatedTarget)&&event.relatedTarget!==previewAnchor)schedulePreviewClose()});
$('close-preview').onclick=()=>{const anchor=previewAnchor;hidePreview();if(anchor){anchor.focus();hidePreview()}};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('card-preview').hidden){const anchor=previewAnchor;hidePreview();if(anchor){anchor.focus();hidePreview()}}});
 document.addEventListener('pointerdown',event=>{if(!event.target.closest('.card-name')&&!$('card-preview').contains(event.target))hidePreview()});
 document.addEventListener('scroll',event=>{if(previewAnchor&&!$('card-preview').contains(event.target)){const rect=previewAnchor.getBoundingClientRect();if(rect.bottom<0||rect.top>window.innerHeight)hidePreview();else positionPreview(previewAnchor)}},true);
 window.addEventListener('resize',hidePreview);

'use strict';
const $=id=>document.getElementById(id);
const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={cards:[],prices:{},history:[],metadata:{},latest:{},sort:'value',direction:-1,page:0,range:'ALL',points:[],hover:0};
const size=100;
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
function overview(){let total=0,basis=0,covered=0,count=0;for(const c of state.cards){if(c.proxy==='true')continue;count+=c.q;const p=unit(c);if(p!=null){total+=p*c.q;basis+=c.cost*c.q;covered+=c.q}}
 $('total').textContent=covered?money(total):'—';$('basis').textContent=money(basis);$('difference').textContent=money(total-basis);$('difference').className=total>=basis?'up':'down';$('count').textContent=count.toLocaleString();$('coverage').textContent=`${covered.toLocaleString()} / ${count.toLocaleString()} cards priced`;
 const latest=state.latest;const prior=state.history.filter(h=>h.date<latest.lastUpdated.slice(0,10)).at(-1);$('daily').textContent=prior?money(total-prior.value):'—';
 $('updated').textContent=`Checked ${new Date(latest.lastUpdated).toLocaleString()} · ${latest.source||'Scryfall USD'} · prices as of ${latest.priceAsOf||latest.lastUpdated.slice(0,10)}`;
}
function renderTable(){
 const search=$('search').value.toLowerCase();let rows=state.cards.filter(c=>matches(c,unit(c))).filter(c=>[c.n,c.binder,c.set,c.setName,info(c).type].join(' ').toLowerCase().includes(search));
 function key(c){const p=unit(c);switch(state.sort){case 'unit':return p;case 'value':return p==null?null:p*c.q;case 'gain':return p==null?null:(p-c.cost)*c.q;default:return c[state.sort]??''}}
 rows.sort((a,b)=>{const x=key(a),y=key(b);if(x==null)return y==null?0:1;if(y==null)return -1;return state.direction*(typeof x==='number'?x-y:String(x).localeCompare(String(y)))||a.n.localeCompare(b.n)});
 const pages=Math.max(1,Math.ceil(rows.length/size));state.page=Math.min(state.page,pages-1);const first=state.page*size;
 $('rows').innerHTML=rows.slice(first,first+size).map(c=>{const p=unit(c);return `<tr><td>${esc(c.n)}<div class="sub">${esc(c.f)} · ${esc(info(c).type||'Type unavailable')}</div></td><td>${esc(c.binder||'Unassigned')}<div class="sub">${esc(c.binderType||'')}</div></td><td>${esc(c.setName||c.set)}<div class="sub">${esc(c.set)}</div></td><td>${c.q}</td><td>${p==null?'—':money(p)}</td><td>${p==null?'—':money(p*c.q)}</td><td>${p==null?'—':money((p-c.cost)*c.q)}</td></tr>`}).join('');
 $('shown').textContent=rows.length?`Showing ${first+1}–${Math.min(first+size,rows.length)} of ${rows.length.toLocaleString()} matching entries`:'No matching entries';$('page').textContent=`Page ${state.page+1} of ${pages}`;$('previous').disabled=state.page===0;$('next').disabled=state.page===pages-1;
 document.querySelectorAll('[data-sort]').forEach(b=>{b.textContent=b.dataset.label+(b.dataset.sort===state.sort?(state.direction===1?' ↑':' ↓'):'');b.parentElement.setAttribute('aria-sort',b.dataset.sort===state.sort?(state.direction===1?'ascending':'descending'):'none')});
}
function graphData(){
 const active=filteredActive(),byId=new Map(state.cards.map(c=>[c.id,c]));let unsupported=0;
 const points=state.history.flatMap(h=>{
  const time=Date.parse(h.timestamp||h.date+'T12:00:00Z');if(state.range!=='ALL'&&time<Date.now()-Number(state.range)*86400000)return [];
  if(!active)return [{...h,time,plot:$('metric').value==='count'?h.quantity:h.value}];
  let items=h.items;
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
function refreshViews(){state.page=0;draw();renderTable()}
async function load(){
 $('reload').disabled=true;try{
  const urls=['latest','history','metadata'];const responses=await Promise.all(urls.map(n=>fetch(`./data/${n}.json`,{cache:'no-store'})));
  if(!responses[0].ok||!responses[1].ok)throw Error('Published price files could not be loaded');
  const latest=await responses[0].json(),history=await responses[1].json(),metadata=responses[2].ok?await responses[2].json():{};
  Object.assign(state,{cards:latest.cards,prices:latest.prices,history,metadata,latest});initializeFilters();overview();refreshViews();$('status').textContent='Shared snapshots loaded. Filter below to explore a subset of the collection.';
 }catch(e){$('status').textContent='Could not load dashboard: '+e.message}finally{$('reload').disabled=false}
}
$('reload').onclick=load;
for(const id of ['binder','set','color','type','minimum'])$(id).onchange=refreshViews;
$('metric').onchange=draw;$('search').oninput=()=>{state.page=0;renderTable()};
function reset(){for(const id of ['binder','set','color','type'])$(id).value='';$('minimum').value='0';$('search').value=''}
$('reset').onclick=()=>{reset();refreshViews()};
document.querySelectorAll('[data-sort]').forEach(b=>{b.dataset.label=b.textContent.replace(/ [↑↓]$/,'');b.onclick=()=>{if(state.sort===b.dataset.sort)state.direction*=-1;else{state.sort=b.dataset.sort;state.direction=['q','unit','value','gain'].includes(state.sort)?-1:1}state.page=0;renderTable()}});
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{state.range=b.dataset.range;document.querySelectorAll('[data-range]').forEach(z=>z.classList.toggle('active',z===b));draw()});
$('previous').onclick=()=>{state.page--;renderTable()};$('next').onclick=()=>{state.page++;renderTable()};
$('chart').onpointermove=$('chart').onpointerdown=e=>{if(!state.points.length)return;const rect=$('chart').getBoundingClientRect(),position=(e.clientX-rect.left)/rect.width*800;let closest=0;state.points.forEach((p,i)=>{if(Math.abs(state.geometry.x(p.time)-position)<Math.abs(state.geometry.x(state.points[closest].time)-position))closest=i});inspect(closest)};
$('chart').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();inspect(Math.max(0,Math.min(state.points.length-1,state.hover+(e.key==='ArrowLeft'?-1:1))))};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({history:state.history,...state.latest,metadata:state.metadata})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mana-portfolio-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
load();

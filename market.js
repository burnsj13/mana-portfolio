'use strict';
var Market=(()=>{
 const source=h=>(h?.source||'').startsWith('Scryfall')?'Scryfall':(h?.source||'').startsWith('MTGJSON')?'MTGJSON':h?.source||'Unknown';
 const items=h=>h?.items||(h?.rowLayout?h.rowLayout.map((r,i)=>[...r,h.unitPrices[i]]):[]);
 const key=c=>c.id+'|'+c.f;
 const maps=new WeakMap();
 function priceMap(h){if(!h)return new Map();if(!maps.has(h))maps.set(h,new Map(items(h).filter(i=>i[4]!=null).map(i=>[i[0]+'|'+i[1],Number(i[4])])));return maps.get(h)}
 const stamp=h=>Date.parse(h.timestamp||h.date+'T12:00:00Z');
 const day=h=>h.timestamp?new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(h.timestamp)):h.date;
 function baseline(history,end,period){
  const cutoff=period==='day'?null:stamp(end)-(period==='week'?7:30)*86400000;
  return history.filter(h=>period==='day'?day(h)<day(end):stamp(h)<=cutoff).at(-1)||null;
 }
 function change(current,before){if(current==null||before==null)return null;return {dollars:current-before,percent:before>0?(current-before)/before*100:null}}
 function rows(cards,prices,history,end,period){
  const base=baseline(history,end,period);if(!base)return {rows:[],base:null};
  const old=priceMap(base),grouped=new Map();
  for(const c of cards){if(c.proxy==='true')continue;const k=key(c);if(grouped.has(k))grouped.get(k).q+=c.q;else grouped.set(k,{...c})}
  const result=[];
  for(const c of grouped.values()){
   const raw=prices[c.id]?.[{foil:'usd_foil',etched:'usd_etched'}[c.f]||'usd'];const p=raw==null?null:Number(raw),delta=change(p,old.get(key(c)));
   if(delta)result.push({...c,price:p,...delta,holdingDollars:delta.dollars*c.q,compatible:source(end)===source(base)});
  }
  return {rows:result,base};
 }
 function qualifies(row,rule){return rule.enabled&&row.compatible&&row.percent!=null&&Math.abs(row.percent)>=rule.percent&&Math.abs(row.dollars)>=rule.dollars&&(rule.direction==='both'||(rule.direction==='up'?row.dollars>0:row.dollars<0))&&row.dollars!==0}
 function spark(history,c,end){const values=history.filter(h=>source(h)===source(end)).slice(-30).map(h=>priceMap(h).get(key(c))).filter(v=>v!=null);if(values.length<2)return '<span class="note">Collecting trend</span>';const min=Math.min(...values),span=Math.max(...values)-min||1;const points=values.map((v,i)=>`${i*100/(values.length-1)},${27-(v-min)/span*24}`).join(' ');return `<svg class="spark" viewBox="0 0 100 30" role="img" aria-label="Recent same-source price observations"><polyline points="${points}" fill="none" stroke="${values.at(-1)>=values[0]?'#61e4b4':'#ff8794'}" stroke-width="2"/></svg>`}
 return {source,items,key,priceMap,stamp,day,baseline,change,rows,qualifies,spark};
})();

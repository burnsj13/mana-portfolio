'use strict';
var PortfolioAnalytics=(()=>{
 function localParts(date){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]))}
 function slot(now){const p=localParts(now),hour=Number(p.hour);let date=`${p.year}-${p.month}-${p.day}`;if(hour<7)date=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)-1)).toISOString().slice(0,10);return date+'T'+(hour>=19||hour<7?'19':'07')+':00'}
 function health(latest,report,delivery,now=new Date()){
  if(!latest?.lastUpdated)return {level:'unknown',label:'No saved prices'};
  const p=localParts(new Date(latest.lastUpdated)),stamp=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`,expected=slot(now),n=localParts(now),wall=`${n.year}-${n.month}-${n.day}T${n.hour}:${n.minute}`;
  const overdue=stamp<expected,grace=(Date.parse(wall+'Z')-Date.parse(expected+'Z'))<3600000;
  if(report?.status==='failure'&&Date.parse(report.checkedAt)>Date.parse(latest.lastUpdated))return {level:'bad',label:'Last update failed'};
  if(overdue)return {level:grace?'waiting':'bad',label:grace?'Scheduled update pending':'Prices overdue'};
  if(delivery?.deliveryError)return {level:'waiting',label:'Prices current · Discord delivery failed'};
  return {level:'good',label:'Prices current'};
 }
 function weekly(cards,prices,history,latest){
  const end={date:latest.lastUpdated.slice(0,10),timestamp:latest.lastUpdated,source:latest.source},result=Market.rows(cards,prices,history,end,'week');
  if(!result.base)return null;
  const old=Market.priceMap(result.base),binders=new Map();let before=0,delta=0,quantity=0;
  for(const c of cards){if(c.proxy==='true')continue;const raw=prices[c.id]?.[{foil:'usd_foil',etched:'usd_etched'}[c.f]||'usd'],base=old.get(Market.key(c));if(raw==null||base==null)continue;const amount=(Number(raw)-base)*c.q;before+=base*c.q;delta+=amount;quantity+=c.q;const binder=c.binder||'Unassigned';binders.set(binder,(binders.get(binder)||0)+amount)}
  return {base:result.base,delta,percent:before>0?delta/before*100:null,quantity,mixed:Market.source(result.base)!==Market.source(end),gainers:result.rows.filter(r=>r.dollars>0).sort((a,b)=>b.holdingDollars-a.holdingDollars).slice(0,5),losers:result.rows.filter(r=>r.dollars<0).sort((a,b)=>a.holdingDollars-b.holdingDollars).slice(0,5),binders:[...binders].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))};
 }
 function series(card,history){const points=new Map();for(const h of history){const value=Market.priceMap(h).get(Market.key(card));if(value!=null)points.set(Market.stamp(h),{time:Market.stamp(h),price:value,source:h.source})}if(card.baseline?.price!=null){const time=Date.parse(card.baseline.timestamp);if(Number.isFinite(time))points.set(time,{time,price:card.baseline.price,source:card.baseline.source})}return [...points.values()].sort((a,b)=>a.time-b.time)}
 return {slot,health,weekly,series};
})();

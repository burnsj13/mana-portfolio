"""Evaluate published collection/wishlist alerts and optionally post graph snapshots to Discord."""
import argparse,hashlib,io,json,os,uuid,time
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlparse
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
from update_prices import ROOT,load_history,save
from supabase_store import load_profile

def source(h):
    value=h.get('source','')
    return 'Scryfall' if value.startswith('Scryfall') else 'MTGJSON' if value.startswith('MTGJSON') else value

def timestamp(h):return datetime.fromisoformat(h.get('timestamp',h['date']+'T12:00:00+00:00').replace('Z','+00:00'))
def day(h):return timestamp(h).astimezone(ZoneInfo('America/New_York')).date().isoformat() if h.get('timestamp') else h['date']

def collection_link(profile):
    return 'https://burnsj13.github.io/mana-portfolio/'+('jacob.html' if profile=='jacob' else '')
def baseline(history,end,period):
    candidates=[h for h in history if day(h)<day(end)] if period=='day' else [h for h in history if timestamp(h)<=timestamp(end)-timedelta(days=7 if period=='week' else 30)]
    return candidates[-1] if candidates else None

def evaluate(latest,history,rule,scope):
    end=dict(source=latest['source'],date=latest['lastUpdated'][:10],timestamp=latest['lastUpdated']);before=baseline(history,end,rule['period'])
    if not before or source(before)!=source(end):return []
    old={(i[0],i[1]):float(i[4]) for i in before.get('items',[]) if i[4] is not None};grouped={}
    for c in latest['cards']:
        if c['proxy']=='true':continue
        key=(c['id'],c['f'])
        if key in grouped:grouped[key]['q']+=c['q']
        else:grouped[key]=dict(c)
    events=[]
    for key,c in grouped.items():
        raw=latest['prices'].get(c['id'],{}).get({'foil':'usd_foil','etched':'usd_etched'}.get(c['f'],'usd'));prior=old.get(key)
        if raw is None or prior is None or prior<=0:continue
        delta=float(raw)-prior;percent=delta/prior*100
        if not rule.get('enabled') or delta==0 or abs(percent)<rule['percent'] or abs(delta)<rule['dollars']:continue
        if rule['direction']=='up' and delta<0 or rule['direction']=='down' and delta>0:continue
        events.append(dict(id=c['id'],n=c['n'],f=c['f'],q=c['q'],price=float(raw),dollars=round(delta,4),percent=round(percent,4),scope=scope,baseline=day(before),direction='up' if delta>0 else 'down'))
    return events

def check_summary(latest,history):
    """Compare with the latest saved observation at or before the 24-hour cutoff."""
    end=dict(date=latest['lastUpdated'][:10],timestamp=latest['lastUpdated'],source=latest['source'])
    cutoff=timestamp(end)-timedelta(hours=24)
    earlier=[h for h in history if timestamp(h)<=cutoff]
    if not earlier:return 'Last 24h change: unavailable (no saved snapshot at least 24 hours earlier).\n'
    before=max(earlier,key=timestamp)
    label=timestamp(before).astimezone(ZoneInfo('America/New_York')).strftime('%b %d, %I:%M %p %Z')
    if source(before)!=source(end):return f'Last 24h baseline: {label}. Price sources differ; change and movers unavailable.\n'
    old={(i[0],i[1]):float(i[4]) for i in before.get('items',[]) if i[4] is not None}
    grouped={}
    for c in latest['cards']:
        if c['proxy']=='true':continue
        key=(c['id'],c['f'])
        if key in grouped:grouped[key]['q']+=c['q']
        else:grouped[key]=dict(c)
    moves=[];prior_total=delta=0;covered=0
    for key,c in grouped.items():
        raw=latest['prices'].get(c['id'],{}).get({'foil':'usd_foil','etched':'usd_etched'}.get(c['f'],'usd'))
        if raw is None or key not in old:continue
        dollars=float(raw)-old[key];holding=dollars*c['q'];prior_total+=old[key]*c['q'];delta+=holding;covered+=c['q']
        moves.append(dict(c,holding=holding,dollars=dollars,percent=dollars/old[key]*100 if old[key]>0 else None))
    if not moves:return f'Last 24h baseline: {label}. No matching priced cards to compare.\n'
    percent=f'{delta/prior_total*100:+.2f}%' if prior_total>0 else 'percentage unavailable'
    text=f'Last 24h change: **{delta:+,.2f} USD ({percent})**\nSaved baseline: {label} (at or before the 24h cutoff). Matched price change on {covered:,} current copies; excludes added/removed and unpriced cards.\n'
    for title,rows,reverse in [('Biggest gainer',[m for m in moves if m['holding']>0],True),('Biggest loser',[m for m in moves if m['holding']<0],False)]:
        if not rows:text+=title+': none.\n';continue
        c=sorted(rows,key=lambda m:m['holding'],reverse=reverse)[0]
        pct=f"{c['percent']:+.2f}%" if c['percent'] is not None else 'percentage unavailable'
        text+=f"{title}: {c['n'][:85]} ({c['f']}) — {c['holding']:+,.2f} USD holdings · {c['dollars']:+.2f} USD/card ({pct}).\n"
    return text

def threshold_description(events,new,rule,limit=1200):
    text=f"Threshold events ({rule['period']}): {len(events)} matching · {len(new)} new\n"
    text+=f"Rule: at least {rule['percent']:g}% and ${rule['dollars']:g}/card.\n"
    fresh={(e['id'],e['f'],e['scope']) for e in new};shown=0
    for e in sorted(events,key=lambda e:abs(e['percent']),reverse=True):
        label='new' if (e['id'],e['f'],e['scope']) in fresh else 'ongoing'
        line=f"{e['n'][:85]} ({e['f']}, {e['scope']}, {label}): ${e['dollars']:+.2f}/card · {e['percent']:+.2f}%\n"
        if len(text)+len(line)+100>limit:break
        text+=line;shown+=1
    if len(events)>shown:text+=f'Plus {len(events)-shown} additional matching events; view the website for details.\n'
    return text

def graph_png(history,latest,title):
    from PIL import Image,ImageDraw,ImageFont
    image=Image.new('RGB',(1000,530),'#090f1d');draw=ImageDraw.Draw(image)
    try:
        font=ImageFont.truetype('DejaVuSans.ttf',17);big=ImageFont.truetype('DejaVuSans.ttf',30)
    except OSError:font=ImageFont.load_default(size=17);big=ImageFont.load_default(size=30)
    draw.text((30,20),title,fill='#f0f5ff',font=big)
    last=history[-1];draw.text((30,65),f"Estimated value: ${last['value']:,.2f} | {last['covered']:,}/{last['quantity']:,} cards priced",fill='#a3b3c9',font=font)
    draw.text((30,92),f"Checked: {latest['lastUpdated'][:19]} UTC | {latest['source']}",fill='#a3b3c9',font=font)
    cutoff=timestamp(last)-timedelta(days=90);points=[h for h in history if timestamp(h)>=cutoff]
    values=[h['value'] for h in points];low=min(values);high=max(values);pad=(high-low or max(high*.05,1))*.12;low=max(0,low-pad);high+=pad
    start=timestamp(points[0]).timestamp();span=timestamp(points[-1]).timestamp()-start or 1
    xy=[(112+(timestamp(h).timestamp()-start)/span*850,420-(h['value']-low)/(high-low or 1)*260) for h in points]
    for i in range(5):
        value=low+(high-low)*i/4;y=420-i/4*260;draw.line((112,y,962,y),fill='#2a3c55');draw.text((15,y-10),f'${value:,.0f}',fill='#a3b3c9',font=font)
    if len(xy)>1:draw.line(xy,fill='#61e4b4',width=4)
    for x,y in [xy[-1]]:draw.ellipse((x-5,y-5,x+5,y+5),fill='#61e4b4')
    draw.text((112,440),points[0]['date'],fill='#a3b3c9',font=font);draw.text((800,440),points[-1]['date'],fill='#a3b3c9',font=font)
    draw.text((30,480),'Saved portfolio totals. Holdings, coverage, and price-source changes can affect this graph.',fill='#a3b3c9',font=font)
    output=io.BytesIO();image.save(output,format='PNG');return output.getvalue()

def post_discord(webhook,content,image):
    parsed=urlparse(webhook)
    if parsed.scheme!='https' or parsed.hostname not in ('discord.com','discordapp.com') or not parsed.path.startswith('/api/webhooks/'):raise RuntimeError('Invalid Discord webhook configuration')
    boundary='ManaPortfolio'+uuid.uuid4().hex
    payload=json.dumps({'content':content[:1900],'allowed_mentions':{'parse':[]},'attachments':[{'id':0,'filename':'portfolio.png'}]})
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n{payload}\r\n--{boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="portfolio.png"\r\nContent-Type: image/png\r\n\r\n').encode()+image+f'\r\n--{boundary}--\r\n'.encode()
    url=webhook+('&' if '?' in webhook else '?')+'wait=true'
    for attempt in range(3):
        try:
            req=Request(url,data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'User-Agent':'ManaPortfolio/3.0'},method='POST')
            with urlopen(req,timeout=30) as response:
                if not 200<=response.status<300:raise RuntimeError('Discord rejected notification')
                response.read()
            return
        except HTTPError as error:
            if error.code==429 and attempt<2:time.sleep(min(30,float(error.headers.get('Retry-After','5'))));continue
            raise RuntimeError('Discord delivery failed (HTTP '+str(error.code)+'); check the repository secret') from None
        except OSError:raise RuntimeError('Discord connection failed; notification was not marked delivered') from None

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--collection',choices=['main','jacob'],default='main');ap.add_argument('--dry-run',action='store_true');ap.add_argument('--graph-output');ap.add_argument('--send-summary',action='store_true');args=ap.parse_args()
    directory=ROOT/'data' if args.collection=='main' else ROOT/'data/jacob';settings=json.loads((ROOT/'settings'/f'{args.collection}.json').read_text(encoding='utf-8-sig'))
    remote=load_profile(ROOT,args.collection)
    if remote is not None:settings=remote['settings']
    rule=settings['alerts']
    if rule['period'] not in ('day','week','month') or rule['direction'] not in ('both','up','down') or not .1<=float(rule['percent'])<=10000 or not 0<=float(rule['dollars'])<=100000:raise ValueError('Invalid alert rules')
    latest=json.loads((directory/'latest.json').read_text());history=load_history(directory);events=evaluate(latest,history,rule,'collection')
    watch_dir=directory/'wishlist'
    if (watch_dir/'latest.json').exists():events+=evaluate(json.loads((watch_dir/'latest.json').read_text()),load_history(watch_dir),rule,'wishlist')
    events=list({(e['id'],e['f']):e for e in reversed(events)}.values())
    state_path=directory/'alert-state.json';previous=json.loads(state_path.read_text()) if state_path.exists() else {};fingerprint=hashlib.sha256(json.dumps(rule,sort_keys=True).encode()).hexdigest()[:12]
    def event_key(e):return '|'.join([fingerprint,e['id'],e['f'],rule['period'],e['baseline'],e['direction']])
    active={event_key(e) for e in events};new=[e for e in events if event_key(e) not in previous.get('active',[])]
    now=datetime.now(timezone.utc);today=now.astimezone(ZoneInfo('America/New_York')).date().isoformat()
    webhook=os.environ.get('DISCORD_WEBHOOK_'+args.collection.upper(),'')
    first_delivery=bool(webhook) and rule.get('enabled',False) and not previous.get('confirmed',False)
    summary=args.send_summary or first_delivery or (rule.get('enabled',False) and rule.get('dailySummary',False) and previous.get('summaryDate')!=today)
    should_send=bool(new or summary);delivered=False
    title='Jacob’s Collection' if args.collection=='jacob' else 'Mana Portfolio'
    # Prepare a private cached graph for the public Supabase send button on every
    # price check. Button clicks never need GitHub access or trigger a refresh.
    image=graph_png(history,latest,title)
    if args.graph_output:Path(args.graph_output).write_bytes(image)
    if not args.dry_run:
        last=history[-1]
        cached=f"**{title}** — ${last['value']:,.2f} · {last['covered']:,}/{last['quantity']:,} cards priced\n"
        cached+=f"Saved prices checked: {latest['lastUpdated']}\nOpen collection: {collection_link(args.collection)}\n"
        cached+=check_summary(latest,history)
        cached+=threshold_description(events,new,rule,limit=1800-len(cached))
        cached+='Wishlist entries are excluded from the portfolio total. Prices are indicative.'
        save(directory/'discord-summary.json',dict(content=cached,checkedAt=latest['lastUpdated']))
        (directory/'discord-graph.png').write_bytes(image)
    if should_send and webhook and not args.dry_run:
        last=history[-1];content=f"**{title}** — ${last['value']:,.2f} · {last['covered']:,}/{last['quantity']:,} cards priced\nPeriod: {rule['period']} · {len(new)} new threshold event(s)\n"
        content+=f'Open collection: {collection_link(args.collection)}\n'
        content+=check_summary(latest,history)
        if first_delivery:content+='Discord connected: initial portfolio graph summary.\n'
        content+=threshold_description(events,new,rule,limit=1800-len(content))
        content+='Wishlist entries are excluded from the portfolio total. Prices are indicative.'
        try:
            post_discord(webhook,content,image);delivered=True
        except RuntimeError as error:
            save(directory/'alert-status.json',dict(checkedAt=now.isoformat(),deliveryConfigured=True,delivered=False,eventCount=len(events),newEventCount=len(new),deliveryError=str(error)))
            raise
    # Never suppress unsent events. Existing active deliveries remain remembered until rearmed.
    remembered=active if delivered else active.intersection(previous.get('active',[]))
    if not args.dry_run:save(state_path,dict(active=sorted(remembered),summaryDate=today if delivered and summary else previous.get('summaryDate'),confirmed=previous.get('confirmed',False) or delivered))
    reason='message delivered' if delivered else 'dry run' if args.dry_run else 'webhook not configured' if not webhook else 'alerts disabled' if not rule.get('enabled') else 'no qualifying alerts and daily summary not due'
    save(directory/'alert-status.json',dict(checkedAt=now.isoformat(),deliveryConfigured=bool(webhook),dryRun=args.dry_run,delivered=delivered,eventCount=len(events),newEventCount=len(new),reason=reason))
    print(f'{args.collection}: {len(events)} matching conditions; {len(new)} new; Discord '+('delivered' if delivered else 'not sent (dry run, no event, or webhook not configured)'))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Alert check failed: '+(str(error) if isinstance(error,(ValueError,RuntimeError)) else type(error).__name__))
        raise SystemExit(1)

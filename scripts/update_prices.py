import csv, json, time, argparse, gzip
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
ROOT=Path(__file__).resolve().parents[1]
HEADERS={'User-Agent':'ManaPortfolio/2.0 (github.com/burnsj13/mana-portfolio)', 'Accept':'application/json'}
def request(url, payload=None):
    for attempt in range(4):
        try:
            req=Request(url, data=json.dumps(payload).encode() if payload else None, headers={**HEADERS,'Content-Type':'application/json'})
            return urlopen(req,timeout=120)
        except HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt==3: raise
            time.sleep(min(60,max(2**attempt,float(error.headers.get('Retry-After','10')))))
        except (OSError,TimeoutError):
            if attempt==3: raise
            time.sleep(2**attempt)
def read(url,payload=None):
    with request(url,payload) as r: return json.load(r)
def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp'); tmp.write_text(json.dumps(obj,separators=(',',':')),encoding='utf-8'); tmp.replace(path)
def collection():
    with (ROOT/'ManaBox_Collection.csv').open(encoding='utf-8-sig',newline='') as f:
        return [dict(n=r['Name'],id=r['Scryfall ID'],q=int(r['Quantity']),f=r['Foil'].lower(),cost=float(r['Purchase price'] or 0),proxy=r['Proxy'].lower(),set=r['Set code'].upper(),added=r['Added'][:10]) for r in csv.DictReader(f)]
def valuation(cards,prices,date,source):
    total=basis=covered=quantity=0
    for c in cards:
        if c['proxy']=='true': continue
        quantity+=c['q']; key={'foil':'usd_foil','etched':'usd_etched'}.get(c['f'],'usd'); v=prices.get(c['id'],{}).get(key)
        if v is not None:
            total+=float(v)*c['q']; basis+=c['cost']*c['q']; covered+=c['q']
    return dict(date=date,value=round(total,2),basis=round(basis,2),covered=covered,quantity=quantity,source=source)
def mapping_for(cards):
    ids={c['id'] for c in cards if c['proxy']!='true'}; mapping={}
    for code in sorted({c['set'] for c in cards if c['proxy']!='true'}):
        print('Historical set:',code,flush=True)
        try: data=read(f'https://mtgjson.com/api/v5/{code}.json')['data']
        except HTTPError as error:
            if error.code==404:
                print('No archive for set',code,flush=True); continue
            raise
        for card in data['cards']:
            sid=card.get('identifiers',{}).get('scryfallId')
            if sid in ids: mapping[card['uuid']]=sid
        time.sleep(.12)
    return mapping

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--backfill',action='store_true'); args=ap.parse_args()
    cards=collection(); now=datetime.now(timezone.utc).isoformat(); path=ROOT/'data/history.json'
    history=json.loads(path.read_text()) if path.exists() else []
    if args.backfill:
        import ijson
        mapping=mapping_for(cards)
        dates={}
        with request('https://mtgjson.com/api/v5/AllPrices.json.gz') as response:
            with gzip.GzipFile(fileobj=response) as stream:
                for uid,record in ijson.kvitems(stream,'data'):
                    if uid not in mapping: continue
                    retail=record.get('paper',{}).get('tcgplayer',{}).get('retail',{})
                    for finish,key in [('normal','usd'),('foil','usd_foil'),('etched','usd_etched')]:
                        for day,value in retail.get(finish,{}).items():
                            if '2026-10-06'<=day<now[:10]: dates.setdefault(day,{}).setdefault(mapping[uid],{})[key]=float(value)
        existing={h['date'] for h in history}
        for day,prices in sorted(dates.items()):
            if day not in existing:
                h=valuation(cards,prices,day,'MTGJSON / TCGplayer retail; current collection reconstructed')
                if h['covered']: history.append(h)
        save(path,sorted(history,key=lambda h:h['date']))
        print('Historical days:',len(dates))
        if not dates: raise RuntimeError('No historical prices found; check archive availability and set mappings')
        return
    ids=sorted({c['id'] for c in cards if c['proxy']!='true' and c['id']}); prices={}
    source='Scryfall USD'; price_as_of=now[:10]
    try:
        for i in range(0,len(ids),75):
            data=read('https://api.scryfall.com/cards/collection',{'identifiers':[{'id':sid} for sid in ids[i:i+75]]})
            if data.get('not_found'): raise RuntimeError('Unmatched IDs; refusing partial snapshot: '+str(data['not_found']))
            for c in data['data']: prices[c['id']]=c['prices']
            time.sleep(.15)
    except HTTPError as error:
        if error.code not in (400,403,429,500,502,503,504): raise
        print('Scryfall unavailable; using labeled MTGJSON TCGplayer fallback',flush=True)
        mapping=mapping_for(cards); prices={}; days=[]
        with request('https://mtgjson.com/api/v5/AllPricesToday.json.gz') as response:
            with gzip.GzipFile(fileobj=response) as stream: records=json.load(stream)['data']
        for uid,sid in mapping.items():
            retail=records.get(uid,{}).get('paper',{}).get('tcgplayer',{}).get('retail',{})
            for finish,key in [('normal','usd'),('foil','usd_foil'),('etched','usd_etched')]:
                series=retail.get(finish,{})
                if series:
                    day=max(series); prices.setdefault(sid,{})[key]=float(series[day]); days.append(day)
        source='MTGJSON / TCGplayer retail (Scryfall unavailable)'
        price_as_of=min(days) if days else None
    snapshot=valuation(cards,prices,now[:10],source); snapshot['timestamp']=now; snapshot['priceAsOf']=price_as_of
    if not snapshot['covered']: raise RuntimeError('No prices returned')
    # Preserve both scheduled observations rather than overwriting a daily value.
    history.append(snapshot); history.sort(key=lambda h:h.get('timestamp',h['date']))
    save(ROOT/'data/latest.json',dict(cards=cards,prices=prices,lastUpdated=now,source=source,priceAsOf=price_as_of))
    save(path,history)
    print('Snapshot saved:',snapshot)
if __name__=='__main__': main()

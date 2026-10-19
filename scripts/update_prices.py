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
        return [dict(n=r['Name'],id=r['Scryfall ID'],q=int(r['Quantity']),f=r['Foil'].lower(),cost=float(r['Purchase price'] or 0),proxy=r['Proxy'].lower(),set=r['Set code'].upper(),setName=r['Set name'],binder=r['Binder Name'],binderType=r['Binder Type'],added=r['Added'][:10]) for r in csv.DictReader(f)]
def valuation(cards,prices,date,source):
    total=basis=covered=quantity=0
    for c in cards:
        if c['proxy']=='true': continue
        quantity+=c['q']; key={'foil':'usd_foil','etched':'usd_etched'}.get(c['f'],'usd'); v=prices.get(c['id'],{}).get(key)
        if v is not None:
            total+=float(v)*c['q']; basis+=c['cost']*c['q']; covered+=c['q']
    items=[[c['id'],c['f'],c['q'],c.get('binder',''),prices.get(c['id'],{}).get({'foil':'usd_foil','etched':'usd_etched'}.get(c['f'],'usd'))] for c in cards if c['proxy']!='true']
    return dict(date=date,value=round(total,2),basis=round(basis,2),covered=covered,quantity=quantity,source=source,items=items)
def mapping_for(cards):
    ids={c['id'] for c in cards if c['proxy']!='true'}; mapping={}; metadata={}
    for code in sorted({c['set'] for c in cards if c['proxy']!='true'}):
        print('Historical set:',code,flush=True)
        try: data=read(f'https://mtgjson.com/api/v5/{code}.json')['data']
        except HTTPError as error:
            if error.code==404:
                print('No archive for set',code,flush=True); continue
            raise
        for card in data['cards']:
            sid=card.get('identifiers',{}).get('scryfallId')
            if sid in ids:
                mapping[card['uuid']]=sid
                previous=metadata.get(sid,{})
                lines=previous.get('type','').split(' // ') if previous.get('type') else []
                if card.get('type') and card['type'] not in lines: lines.append(card['type'])
                faces=previous.get('faces',[])
                face=dict(name=card.get('faceName') or card.get('name',''),mana=card.get('manaCost',''),text=card.get('text',''),type=card.get('type',''),power=card.get('power'),toughness=card.get('toughness'),loyalty=card.get('loyalty'))
                if not any(f['name']==face['name'] for f in faces): faces.append(face)
                metadata[sid]=dict(faces=faces,colors=sorted(set(previous.get('colors',[])+card.get('colors',[]))),type=' // '.join(lines),types=sorted(set(previous.get('types',[])+card.get('types',[]))))
        time.sleep(.12)
    save(ROOT/'data/metadata.json',metadata)
    return mapping

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--backfill',action='store_true'); ap.add_argument('--metadata-only',action='store_true'); args=ap.parse_args()
    cards=collection(); now=datetime.now(timezone.utc).isoformat(); path=ROOT/'data/history.json'
    history=json.loads(path.read_text()) if path.exists() else []
    if args.metadata_only:
        mapping_for(cards); return
    if args.backfill:
        import ijson
        mapping=mapping_for(cards)
        latest_path=ROOT/'data/latest.json'
        if latest_path.exists():
            latest=json.loads(latest_path.read_text()); latest['cards']=cards; save(latest_path,latest)
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
        for h in history:
            if h['source'].startswith('MTGJSON') and h['date'] in dates:
                h['items']=valuation(cards,dates[h['date']],h['date'],h['source'])['items']
        for day,prices in sorted(dates.items()):
            if day not in existing:
                h=valuation(cards,prices,day,'MTGJSON / TCGplayer retail; current collection reconstructed')
                if h['covered']: history.append(h)
        save(path,sorted(history,key=lambda h:h['date']))
        print('Historical days:',len(dates))
        if not dates: raise RuntimeError('No historical prices found; check archive availability and set mappings')
        return
    if not (ROOT/'data/metadata.json').exists(): mapping_for(cards)
    ids=sorted({c['id'] for c in cards if c['proxy']!='true' and c['id']}); prices={}
    source='Scryfall USD'; price_as_of=now[:10]
    try:
        for i in range(0,len(ids),75):
            data=read('https://api.scryfall.com/cards/collection',{'identifiers':[{'id':sid} for sid in ids[i:i+75]]})
            if data.get('not_found'): raise RuntimeError('Unmatched IDs; refusing partial snapshot: '+str(data['not_found']))
            metadata_path=ROOT/'data/metadata.json'
            metadata=json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
            for c in data['data']:
                prices[c['id']]=c['prices']
                faces=c.get('card_faces',[c])
                colors=sorted({color for face in faces for color in face.get('colors',c.get('colors',[]))})
                line=c.get('type_line','')
                types=[t for t in ['Artifact','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'] if t in line.split(' — ')[0].split() or any(t in face.get('type_line','').split(' — ')[0].split() for face in faces)]
                details=[dict(name=f.get('name',c.get('name','')),mana=f.get('mana_cost',''),text=f.get('oracle_text',''),type=f.get('type_line',line),power=f.get('power'),toughness=f.get('toughness'),loyalty=f.get('loyalty')) for f in faces]
                metadata[c['id']]=dict(colors=colors,type=line,types=types,faces=details)
            save(metadata_path,metadata)
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
    print('Snapshot saved:',{k:v for k,v in snapshot.items() if k!='items'})
if __name__=='__main__': main()

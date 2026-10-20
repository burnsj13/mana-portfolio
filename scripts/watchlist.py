"""Fixed, exact-printing/finish baselines for wishlist alerts."""
import math
from datetime import datetime,timezone

def moment(value):return datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(timezone.utc)

def provider(value):
    text=value.get('source','')
    return 'Scryfall' if text.startswith('Scryfall') else 'MTGJSON' if text.startswith('MTGJSON') else text

def valid_baseline(value):
    try:return isinstance(value,dict) and isinstance(value['price'],(int,float)) and math.isfinite(value['price']) and value['price']>=0 and bool(value['source']) and bool(moment(value['timestamp']))
    except (KeyError,TypeError,ValueError,AttributeError):return False

def seed_baselines(cards,history,prices,source,now):
    history=sorted(history,key=lambda h:h.get('timestamp',h['date']+'T12:00:00+00:00'))
    for card in cards:
        if valid_baseline(card.get('baseline')):continue
        added=moment(card['addedAt']) if card.get('addedAt') else None
        for snapshot in history:
            stamp=snapshot.get('timestamp',snapshot['date']+'T12:00:00+00:00')
            if added and moment(stamp)<added:continue
            raw=next((i[4] for i in snapshot.get('items',[]) if i[:2]==[card['id'],card['f']] and i[4] is not None),None)
            candidate=dict(price=float(raw),source=snapshot['source'],timestamp=stamp) if raw is not None else None
            if valid_baseline(candidate):card['baseline']=candidate;break
        if not valid_baseline(card.get('baseline')):
            raw=prices.get(card['id'],{}).get({'foil':'usd_foil','etched':'usd_etched'}.get(card['f'],'usd'))
            candidate=dict(price=float(raw),source=source,timestamp=now) if raw is not None else None
            if valid_baseline(candidate):card['baseline']=candidate

def evaluate_watchlist(latest,rule):
    percent=float(rule.get('watchPercent',rule['percent']));direction=rule.get('watchDirection','both')
    if not .1<=percent<=10000 or direction not in ('both','up','down'):raise ValueError('Invalid wishlist alert rule')
    if not rule.get('enabled'):return []
    events=[]
    for card in latest['cards']:
        base=card.get('baseline')
        if not valid_baseline(base) or base['price']<=0 or provider(base)!=provider(latest):continue
        raw=latest['prices'].get(card['id'],{}).get({'foil':'usd_foil','etched':'usd_etched'}.get(card['f'],'usd'))
        if raw is None:continue
        delta=float(raw)-base['price'];change=delta/base['price']*100
        if not math.isfinite(change) or delta==0 or abs(change)<percent:continue
        if direction=='up' and delta<0 or direction=='down' and delta>0:continue
        events.append(dict(id=card['id'],n=card['n'],f=card['f'],q=1,price=float(raw),dollars=round(delta,4),percent=round(change,4),scope='wishlist',baseline=base['timestamp'],baselinePrice=base['price'],direction='up' if delta>0 else 'down'))
    return events

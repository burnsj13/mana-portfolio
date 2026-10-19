"""Import existing holdings once, then upload compact archives into private storage."""
import argparse,json
from pathlib import Path
from supabase_store import configuration,request
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--bootstrap',action='store_true');ap.add_argument('--restore',action='store_true');args=ap.parse_args()
    config=configuration(ROOT)
    if not config:raise RuntimeError('Supabase configuration missing')
    for slug in ('main','jacob'):
        directory=ROOT/'data' if slug=='main' else ROOT/'data/jacob'
        if args.restore:
            from urllib.error import HTTPError
            for prefix in ('','wishlist/'):
                base=f'/storage/v1/object/authenticated/portfolio-history/{slug}/'
                try:index=request(config,base+prefix+'history-index.json')
                except HTTPError as e:
                    # A brand-new bucket has no archives yet. Other failures stop
                    # updates, so an outage cannot silently reset saved history.
                    if e.code not in (400,404):raise
                    detail=json.loads(e.read())
                    if str(detail.get('statusCode'))!='404':raise
                    continue
                names=index['files']+[prefix+'history-index.json']
                if prefix:names=[prefix+n for n in index['files']]+[prefix+'history-index.json',prefix+'latest.json']
                else:names+=['latest.json','metadata.json','alert-state.json','alert-status.json']
                from update_prices import save
                import re
                for name in names:
                    if not re.fullmatch(r'(wishlist/)?(history/\d{4}-\d{2}\.json|history-index\.json|latest\.json|metadata\.json|alert-state\.json|alert-status\.json)',name):raise ValueError('Invalid private archive path')
                    try:value=request(config,base+name)
                    except HTTPError as e:
                        if name not in ('metadata.json','alert-state.json','alert-status.json'):raise
                        if e.code not in (400,404):raise
                        detail=json.loads(e.read())
                        if str(detail.get('statusCode'))!='404':raise
                        continue
                    save(directory/name,value)
            print('Private history restored:',slug)
            continue
        if args.bootstrap:
            latest=json.loads((directory/'latest.json').read_text(encoding='utf-8-sig'))
            settings=json.loads((ROOT/'settings'/f'{slug}.json').read_text(encoding='utf-8-sig'))
            request(config,'/rest/v1/rpc/portfolio_bootstrap','POST',dict(p_slug=slug,p_cards=latest['cards'],p_settings=settings))
            print('Collection initial import checked:',slug)
            continue
        paths=[directory/name for name in ('latest.json','metadata.json','alert-status.json','alert-state.json','discord-summary.json','discord-graph.png')]
        paths+=sorted((directory/'history').glob('*.json'))
        paths+=sorted((directory/'wishlist/history').glob('*.json'))+[directory/'wishlist/latest.json',directory/'wishlist/history-index.json',directory/'history-index.json']
        count=0
        for path in paths:
            if not path.exists():continue
            name=path.relative_to(directory).as_posix()
            request(config,f'/storage/v1/object/portfolio-history/{slug}/{name}','POST',path.read_bytes(),raw=True)
            count+=1
        print('Private archive files uploaded:',slug,count)
if __name__=='__main__':main()

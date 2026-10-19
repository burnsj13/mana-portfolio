"""Private Supabase reads for scheduled jobs; no privileged key is published."""
import json, os
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlparse

def configuration(root):
    path=Path(root)/'supabase-config.json'
    if not path.exists():return None
    config=json.loads(path.read_text(encoding='utf-8-sig'))
    url=config['url'].rstrip('/');parsed=urlparse(url)
    if parsed.scheme!='https' or not parsed.hostname.endswith('.supabase.co') or parsed.path:raise ValueError('Invalid Supabase URL')
    key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
    if not key:raise RuntimeError('Set the SUPABASE_SERVICE_ROLE_KEY repository secret before running private collection updates')
    return url,key

def request(config,path,method='GET',body=None,raw=False):
    url,key=config;headers={'apikey':key,'Content-Type':'application/json'}
    if not key.startswith('sb_secret_'):headers['Authorization']='Bearer '+key
    if raw:headers.update({'Content-Type':'image/png' if path.endswith('.png') else 'application/json','x-upsert':'true','Cache-Control':'private, max-age=0'})
    data=body if raw else json.dumps(body).encode() if body is not None else None
    with urlopen(Request(url+path,data=data,headers=headers,method=method),timeout=90) as response:
        content=response.read()
        return json.loads(content) if content else None

def rows(config,table,slug):
    result=[]
    for offset in range(0,100000,500):
        page=request(config,f'/rest/v1/{table}?collection=eq.{slug}&select=*&order=entry_id&limit=500&offset={offset}')
        result.extend(page)
        if len(page)<500:return result
    raise RuntimeError('Collection exceeds supported row count')

def load_profile(root,slug):
    config=configuration(root)
    if config is None:return None
    records=request(config,f'/rest/v1/portfolio_collections?slug=eq.{slug}&select=*')
    if not records or not records[0]['initialized']:raise RuntimeError('Supabase collection needs its owner assigned and initial import completed')
    settings=request(config,f'/rest/v1/portfolio_settings?collection=eq.{slug}&select=settings')
    if len(settings)!=1:raise RuntimeError('Supabase collection settings are missing')
    return {'cards':[r['payload'] for r in rows(config,'portfolio_cards',slug)],'settings':settings[0]['settings']}

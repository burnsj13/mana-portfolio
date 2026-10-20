"""Once-per-week recaps and once-per-version release announcements."""
import argparse,json,os
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.error import HTTPError
from urllib.request import Request,urlopen
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
from supabase_store import configuration,request
from update_prices import load_history
from check_alerts import check_summary,post_discord,graph_png,collection_link
ROOT=Path(__file__).resolve().parents[1]

def state_for(config,profile):
    try:return request(config,f'/storage/v1/object/authenticated/portfolio-history/{profile}/notification-state.json')
    except HTTPError as error:
        if error.code not in (400,404):raise
        if str(json.loads(error.read()).get('statusCode'))!='404':raise
        return {}

def post_text(webhook,content):
    parsed=urlparse(webhook)
    if parsed.scheme!='https' or parsed.hostname not in ('discord.com','discordapp.com') or not parsed.path.startswith('/api/webhooks/'):raise RuntimeError('Invalid Discord destination')
    payload=json.dumps(dict(content=content[:1900],allowed_mentions={'parse':[]})).encode()
    req=Request(webhook+('&' if '?' in webhook else '?')+'wait=true',data=payload,headers={'Content-Type':'application/json','User-Agent':'ManaPortfolio/4.0'},method='POST')
    try:
        with urlopen(req,timeout=30) as response:
            if not 200<=response.status<300:raise RuntimeError('Discord rejected announcement')
            response.read()
    except (HTTPError,OSError):raise RuntimeError('Discord announcement failed; it will be retried on a later run') from None

def deliver(profile,mode,config,now=None):
    webhook=os.environ.get('DISCORD_WEBHOOK_'+profile.upper(),'')
    if not webhook:print(profile+': no Discord destination for '+mode);return False
    state=state_for(config,profile);now=now or datetime.now(timezone.utc)
    title='Jacob’s Collection' if profile=='jacob' else 'Mana Portfolio'
    if mode=='release':
        release=json.loads((ROOT/'release-notes.json').read_text(encoding='utf-8-sig'));version=release['version']
        if state.get('releaseVersion')==version:return False
        content=f"**Mana Portfolio update · {version}**\n"+'\n'.join('- '+note for note in release['notes'])+'\nOpen collection: '+collection_link(profile)
        post_text(webhook,content);state['releaseVersion']=version
    else:
        local=now.astimezone(ZoneInfo('America/New_York'));monday=(local-timedelta(days=local.weekday())).replace(hour=7,minute=0,second=0,microsecond=0);week=monday.date().isoformat()
        if local<monday or state.get('weeklyKey')==week:return False
        directory=ROOT/'data' if profile=='main' else ROOT/'data/jacob';latest=json.loads((directory/'latest.json').read_text());history=load_history(directory)
        content=f"**{title} · weekly price breakdown**\nEstimated total: ${history[-1]['value']:,.2f}\n"+check_summary(latest,history,hours=168)+'Open collection: '+collection_link(profile)
        image=(directory/'discord-graph.png').read_bytes() if (directory/'discord-graph.png').exists() else graph_png(history,latest,title)
        post_discord(webhook,content,image);state['weeklyKey']=week
    state['checkedAt']=now.isoformat();request(config,f'/storage/v1/object/portfolio-history/{profile}/notification-state.json','POST',json.dumps(state).encode(),raw=True)
    print(profile+': '+mode+' delivered');return True

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mode',choices=['release','weekly'],required=True);args=parser.parse_args();config=configuration(ROOT)
    failed=False
    for profile in ('main','jacob'):
        try:deliver(profile,args.mode,config)
        except Exception as error:failed=True;print(profile+': '+str(error) if isinstance(error,RuntimeError) else profile+': notification request failed')
    if failed:raise SystemExit(1)
if __name__=='__main__':main()

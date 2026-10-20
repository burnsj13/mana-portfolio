"""Run due 07:00/19:00 updates, with freshness-based catch-up after cron delays."""
import os
from datetime import datetime,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from supabase_store import configuration,request
from urllib.error import HTTPError

ZONE=ZoneInfo('America/New_York')
ROOT=Path(__file__).resolve().parents[1]

def should_run(event,schedule,at=None):
    if event!='schedule':return True
    if schedule=='17,47 * * * *':return True
    local=(at or datetime.now(ZoneInfo('America/New_York'))).astimezone(ZoneInfo('America/New_York'))
    wanted='0 11,23 * * *' if local.dst() else '0 0,12 * * *'
    return schedule==wanted

def latest_slot(at):
    local=at.astimezone(ZONE)
    if local.hour>=19:return local.replace(hour=19,minute=0,second=0,microsecond=0)
    if local.hour>=7:return local.replace(hour=7,minute=0,second=0,microsecond=0)
    return (local-timedelta(days=1)).replace(hour=19,minute=0,second=0,microsecond=0)

def is_due(checked,at):
    slot=latest_slot(at)
    for profile in ('main','jacob'):
        value=checked.get(profile)
        if not value:return True
        if datetime.fromisoformat(value.replace('Z','+00:00'))<slot:return True
    return False

def saved_checks(root=ROOT):
    config=configuration(root)
    if not config:raise RuntimeError('Supabase configuration missing')
    result={}
    for profile in ('main','jacob'):
        try:result[profile]=request(config,f'/storage/v1/object/authenticated/portfolio-history/{profile}/discord-summary.json').get('checkedAt')
        except HTTPError as error:
            if error.code not in (400,404):raise
            import json
            if str(json.loads(error.read()).get('statusCode'))!='404':raise
            result[profile]=None
    return result

if __name__=='__main__':
    event=os.environ['EVENT_NAME'];schedule=os.environ.get('EVENT_SCHEDULE','')
    now=datetime.now(ZONE)
    result=should_run(event,schedule,now)
    if result and event=='schedule':result=is_due(saved_checks(),now)
    print('Price update '+('due' if result else 'not due')+'; latest scheduled slot: '+latest_slot(now).isoformat())
    with open(os.environ['GITHUB_OUTPUT'],'a') as output:output.write('run='+str(result).lower()+'\n')

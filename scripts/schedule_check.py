"""Select the UTC cron pair that is 07:00/19:00 in America/New_York."""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

def should_run(event,schedule,at=None):
    if event!='schedule':return True
    local=(at or datetime.now(ZoneInfo('America/New_York'))).astimezone(ZoneInfo('America/New_York'))
    wanted='0 11,23 * * *' if local.dst() else '0 0,12 * * *'
    return schedule==wanted

if __name__=='__main__':
    result=should_run(os.environ['EVENT_NAME'],os.environ.get('EVENT_SCHEDULE',''))
    with open(os.environ['GITHUB_OUTPUT'],'a') as output:output.write('run='+str(result).lower()+'\n')

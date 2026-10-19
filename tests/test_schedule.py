import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from schedule_check import should_run

class ScheduleTests(unittest.TestCase):
    def test_two_daily_checks_at_seven_in_both_seasons(self):
        for month in [1,6,10,12]:
            selected=[]
            for schedule,hours in [('0 11,23 * * *',[11,23]),('0 0,12 * * *',[0,12])]:
                for hour in hours:
                    at=datetime(2026,month,19,hour,tzinfo=timezone.utc)
                    if should_run('schedule',schedule,at):selected.append(at.astimezone(ZoneInfo('America/New_York')).hour)
            self.assertEqual(sorted(selected),[7,19])
    def test_push_and_manual_runs_still_run(self):
        self.assertTrue(should_run('push',''));self.assertTrue(should_run('workflow_dispatch',''))

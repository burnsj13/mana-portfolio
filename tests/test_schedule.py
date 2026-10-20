import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from schedule_check import should_run,is_due,latest_slot

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
    def test_watchdog_catches_missed_morning_without_duplicate_updates(self):
        now=datetime(2026,10,20,14,24,tzinfo=timezone.utc)
        self.assertTrue(should_run('schedule','17,47 * * * *',now))
        self.assertTrue(is_due({'main':'2026-10-20T01:24:26Z','jacob':'2026-10-20T01:24:55Z'},now))
        self.assertFalse(is_due({'main':'2026-10-20T11:04:00Z','jacob':'2026-10-20T11:05:00Z'},now))
        self.assertTrue(is_due({'main':'2026-10-20T11:04:00Z','jacob':None},now))
    def test_slots_follow_local_days_dst_and_evening(self):
        self.assertEqual(latest_slot(datetime(2026,10,20,10,tzinfo=timezone.utc)).isoformat(),'2026-10-19T19:00:00-04:00')
        self.assertTrue(is_due({'main':'2026-10-20T11:04:00Z','jacob':'2026-10-20T11:05:00Z'},datetime(2026,10,21,0,tzinfo=timezone.utc)))
        self.assertEqual(latest_slot(datetime(2026,12,20,13,tzinfo=timezone.utc)).isoformat(),'2026-12-20T07:00:00-05:00')

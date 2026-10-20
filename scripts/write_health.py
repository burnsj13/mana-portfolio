"""Publish an authenticated background-update status, including failed jobs."""
import argparse,os
from pathlib import Path
from datetime import datetime,timezone
from supabase_store import configuration,request
ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--status',choices=['success','failure','cancelled'],required=True);args=parser.parse_args()
    config=configuration(ROOT)
    report=dict(status=args.status,checkedAt=datetime.now(timezone.utc).isoformat(),runUrl='https://github.com/'+os.environ.get('GITHUB_REPOSITORY','burnsj13/mana-portfolio')+'/actions/runs/'+os.environ.get('GITHUB_RUN_ID',''))
    import json
    for profile in ('main','jacob'):request(config,f'/storage/v1/object/portfolio-history/{profile}/health.json','POST',json.dumps(report).encode(),raw=True)
if __name__=='__main__':main()

import csv,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import update_prices as updater

class WishlistTests(unittest.TestCase):
    def test_collects_unowned_prices_separately(self):
        self.check_profile('main')

    def test_jacob_collects_unowned_prices_separately(self):
        self.check_profile('jacob')

    def check_profile(self,profile):
        own='00000000-0000-0000-0000-000000000001';wish='00000000-0000-0000-0000-000000000002'
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);csv_path=root/('Jacob_manabox.csv' if profile=='jacob' else 'ManaBox_Collection.csv');directory=root/('data/jacob' if profile=='jacob' else 'data')
            row={'Name':'Owned','Scryfall ID':own,'Quantity':'2','Foil':'normal','Purchase price':'1','Proxy':'false','Set code':'ABC','Set name':'Test','Binder Name':'Owned','Binder Type':'binder','Added':'2026-10-01'}
            with csv_path.open('w',newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=list(row));writer.writeheader();writer.writerow(row)
            updater.save(root/'settings'/f'{profile}.json',{'watchlist':[dict(id=wish,n='Unowned',f='normal')]})
            def fetch(url,payload=None):
                self.assertEqual({x['id'] for x in payload['identifiers']},{own,wish})
                return {'data':[dict(id=card,prices={'usd':'2'},type_line='Creature',colors=['U'],name=card) for card in [own,wish]]}
            with patch.object(updater,'ROOT',root),patch.object(updater,'DATA_DIR',directory),patch.object(updater,'CSV_PATH',csv_path),patch.object(updater,'mapping_for',return_value={}),patch.object(updater,'read',side_effect=fetch),patch.object(updater.time,'sleep'),patch.object(sys,'argv',['update_prices.py','--collection',profile]):updater.main()
            portfolio=updater.load_history(directory);wishlist=updater.load_history(directory/'wishlist')
            self.assertEqual(portfolio[0]['value'],4)
            self.assertEqual({i[0] for i in portfolio[0]['items']},{own})
            self.assertEqual(wishlist[0]['value'],2)
            self.assertEqual({i[0] for i in wishlist[0]['items']},{wish})
if __name__=='__main__':unittest.main()

"""Rebuild CPBL/NPB playable snapshots from official rosters (not live ratings).

Python 3 + lxml. Run from the repository root. Fails closed on missing teams,
duplicate IDs, unknown positions, or a missing complete position group.
Ratings and extra fielding eligibility are explicitly game-only estimates.
"""
import concurrent.futures
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from lxml import html

OUT = Path('dist/data')
NPB = [
 ('g','讀賣巨人','G','#f47920'),('t','阪神虎','T','#c8a619'),
 ('db','橫濱DeNA海灣之星','D','#0075c2'),('c','廣島東洋鯉魚','C','#cf1225'),
 ('s','東京養樂多燕子','S','#176b50'),('d','中日龍','D','#0055a4'),
 ('h','福岡軟銀鷹','H','#c69b00'),('f','北海道日本火腿鬥士','F','#0077a6'),
 ('m','千葉羅德海洋','M','#333333'),('e','東北樂天金鷲','E','#870010'),
 ('b','歐力士猛牛','B','#9a792e'),('l','埼玉西武獅','L','#194571')]
CPBL = [('ACN','中信兄弟','兄','#c7a200'),('ADD','統一7-ELEVEn獅','獅','#df691a'),
 ('AJL','樂天桃猿','猿','#8b1538'),('AEO','富邦悍將','悍','#0056a1'),
 ('AAA','味全龍','龍','#d62429'),('AKP','台鋼雄鷹','鷹','#176447')]
NAMES_ZH = json.loads(Path(__file__).with_name('npb_names_zh.json').read_text())
STAMP = datetime.now(timezone.utc).isoformat()

def fetch(url):
    with urlopen(Request(url, headers={'User-Agent':'DUGOUT roster snapshot/1.0'}), timeout=45) as response:
        return response.read().decode('utf-8')

def team(league, code, name, abbr, color, source):
    return dict(id=f'{league.lower()}:{code}', name=name, zh=name, abbr=abbr,
                color=color, league=league, source_url=source)

def player(league, ident, name, t, pos, **extra):
    ident=f'{league.lower()}:{ident}'
    # Stable game-balancing placeholders; never presented as statistical scouting.
    digest=hashlib.sha256(ident.encode()).digest()
    keys=['stuff','control','movement','stamina'] if pos=='P' else ['contact','power','eye','speed','defense']
    ratings={key:40+digest[i]%21 for i,key in enumerate(keys)}
    positions={'IF':['1B','2B','3B','SS','DH'],'OF':['LF','CF','RF','DH']}.get(pos,[pos] if pos=='P' else [pos,'DH'])
    return dict(id=ident,name=name,team_id=t['id'],position=pos,positions=positions,
                role=('SP' if digest[5]%3 else 'RP') if pos=='P' else None,
                ratings=ratings,ratings_source='game_balance_estimate',
                positions_source='roster_group_estimate' if pos in ('IF','OF') else 'official_primary',
                status='Active',**extra)

def npb(entry):
    code,name,abbr,color=entry;url=f'https://npb.jp/bis/teams/rst_{code}.html'
    doc=html.fromstring(fetch(url));t=team('NPB',code,name,abbr,color,url);players=[]
    tables=doc.xpath('//table[contains(@class,"rosterlisttbl")]')
    if not tables:raise ValueError(f'Missing NPB roster {code}')
    pos=None
    # First table contains registered players; second is developmental roster.
    for row in tables[0].xpath('.//tr'):
        if 'rosterMainHead' in row.get('class',''):
            text=''.join(row.itertext());pos=next((p for label,p in [('投手','P'),('捕手','C'),('内野手','IF'),('外野手','OF')] if label in text),None);continue
        cells=row.xpath('./td');links=row.xpath('.//td[contains(@class,"rosterRegister")]/a')
        if not pos or not links or len(cells)<8:continue
        values=[''.join(c.itertext()).strip() for c in cells]
        if any(word in values[7] for word in ['移籍','自由契約','引退']):continue
        link=links[0];ident=re.search(r'/players/(\d+)\.html',link.get('href')).group(1)
        fullname=re.sub(r'\s+','',''.join(link.itertext()))
        display=NAMES_ZH.get(fullname,fullname)
        if re.search('[ァ-ヿＡ-Ｚａ-ｚA-Za-z]',display):raise ValueError(f'Missing Chinese alias: {fullname}')
        players.append(player('NPB',ident,display,t,pos,name_transliterated=display!=fullname,source_name=fullname,
            source_url='https://npb.jp'+link.get('href'),jersey_number=values[0],birth_date=values[2].replace('.','-'),
            throws={'右':'R','左':'L','両':'S'}.get(values[5],'R'),bats={'右':'R','左':'L','両':'S'}.get(values[6],'R')))
    return t,players

def cpbl():
    url='https://stats.cpbl.com.tw/players';doc=html.fromstring(fetch(url));flight=''
    for script in doc.xpath('//script[not(@src)]/text()'):
        if script.startswith('self.__next_f.push([1,'):
            flight+=json.loads(script[len('self.__next_f.push('):-1])[1]
    rows=None
    for line in flight.splitlines():
        try:obj=json.loads(line.split(':',1)[1])
        except (ValueError,IndexError):continue
        if isinstance(obj,list) and len(obj)>3 and isinstance(obj[3],dict):
            for query in obj[3].get('state',{}).get('queries',[]):
                payload=query.get('state',{}).get('data',{})
                if isinstance(payload,dict) and isinstance(payload.get('data'),dict) and 'players' in payload['data']:
                    rows=payload['data']['players']
    if not rows:raise ValueError('Official CPBL players payload missing')
    teams=[team('CPBL',*entry,url) for entry in CPBL];bycode={t['id'].split(':')[1]:t for t in teams};players=[]
    for row in rows:
        t=bycode.get(row.get('team',{}).get('code','')[:3])
        if not t or row.get('retiredDate'):continue
        pos={'1':'P','2':'C','3':'1B','4':'2B','5':'3B','6':'SS','7':'LF','8':'CF','9':'RF','10':'DH'}.get(row['defendStation'])
        if not pos:raise ValueError(f'Unknown CPBL position {row}')
        name=re.sub(r'^[#*＊◎▲\s]+','',''.join(row['chName'].split()))
        players.append(player('CPBL',row['acnt'],name,t,pos,source_name=row['chName'],source_url=url+'/'+row['acnt'],jersey_number=row['uniformNo']))
    return teams,players

def write(league,teams,players):
    ids=[p['id'] for p in players]
    if len(set(ids))!=len(ids):raise ValueError(f'Duplicate player in {league}')
    for t in teams:
        pool=[p for p in players if p['team_id']==t['id']]
        available=set(pos for p in pool for pos in p['positions'])
        if not set(['P','C','1B','2B','3B','SS','LF','CF','RF','DH'])<=available or len(pool)<25:
            raise ValueError(f'Incomplete roster {t["name"]}')
        # Five deterministic starters in the game rotation; role is an estimate.
        pitchers=[p for p in pool if p['position']=='P']
        for i,p in enumerate(pitchers):p['role']='SP' if i<5 else 'RP';p['ratings']['stamina']=60 if i<5 else 40
    result=dict(league=league,season=2026,generated_at=STAMP,teams=teams,players=players,
        snapshot_date=STAMP[:10],ratings_note='能力為遊戲平衡估計，尚未依逐季成績校準；非官方球探評分。',
        positions_note='日職內外野細分守位與投手先發／後援分工為遊戲估計。',
        name_note='日本球員保留漢字；片假名姓名使用遊戲中文音譯，非官方譯名。',
        source_note='官方名單快照；含中職一、二軍，日職支配下登錄球員。非即時名單。')
    (OUT/f'roster_{league.lower()}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(league,len(teams),'teams',len(players),'players')

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(npb,entry) for entry in NPB]
        cf=pool.submit(cpbl)
        npbs=[f.result() for f in futures];ct,cp=cf.result()
    write('NPB',[t for t,p in npbs],[q for t,p in npbs for q in p]);write('CPBL',ct,cp)

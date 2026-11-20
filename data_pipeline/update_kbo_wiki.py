"""Updates dist/data/roster_kbo.json to the post-2026 KBO rosters published on Korean Wikipedia.

Why Wikipedia: koreabaseball.com's robots.txt forbids automated collection, crawling or copying
without prior approval, so this script never touches the KBO site. Korean Wikipedia's team roster
templates ("틀:<team> 명단", CC BY-SA) list each club's current players, but no game stats.

What it does
- Starts from the 2025-10-31 snapshot built by build_kbo.py (kept as roster_kbo_20251031.json so
  older saves can still load it).
- Players still on a 2026 roster keep their stat-based ratings (2024–2025 first-team stats) and get
  their new club and uniform number.
- Players new to KBO (foreigners, Asia-quota players, rookies, returnees) get ESTIMATED ratings by
  type (see estimate_ratings), and their birth date, bats/throws, nationality and position come from
  their Korean Wikipedia article infobox when it exists.
- Players no longer on any roster are dropped; players found on this repo's MLB/NPB snapshots are
  dropped too (MOVED_ABROAD, reviewed by hand).

Run (MediaWiki API only, about 1 request per 3 s, cached under data_pipeline/.cache/wiki):
    python data_pipeline/update_kbo_wiki.py
"""
import collections, datetime, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kbo_names_zh import zh_name

DIST = os.path.join(HERE, '..', 'dist', 'data')
BASE = os.path.join(DIST, 'roster_kbo_20251031.json')
OUT = os.path.join(DIST, 'roster_kbo.json')
CACHE = os.path.join(HERE, '.cache', 'wiki')
HOST = 'ko.wikipedia.org'
UA = 'DUGOUT-roster-pipeline/1.0 (personal non-commercial baseball game; github.com/hyyang0509/dugout-baseball)'
SNAPSHOT = '2026-11-20'
MAX_ROSTER = 70

TEAM_PAGES = {
 'kbo:HT': 'KIA 타이거즈', 'kbo:SS': '삼성 라이온즈', 'kbo:LG': 'LG 트윈스', 'kbo:OB': '두산 베어스', 'kbo:KT': 'KT 위즈',
 'kbo:SK': 'SSG 랜더스', 'kbo:LT': '롯데 자이언츠', 'kbo:HH': '한화 이글스', 'kbo:NC': 'NC 다이노스', 'kbo:WO': '키움 히어로즈',
}
GROUPS = {'투수': 'P', '포수': 'C', '내야수': 'IF', '외야수': 'OF'}
INFOBOX_POS = {'투수': 'P', '포수': 'C', '1루수': '1B', '2루수': '2B', '3루수': '3B', '유격수': 'SS', '좌익수': 'LF', '중견수': 'CF', '우익수': 'RF', '외야수': 'OF', '내야수': 'IF'}
NATION = {'대한민국': 'KOR', '한국': 'KOR', '{{KOR}}': 'KOR', '일본': 'JPN', '{{JPN}}': 'JPN', '중화민국': 'TWN', '대만': 'TWN', '타이완': 'TWN', '{{TPE}}': 'TWN', '{{TWN}}': 'TWN'}
# Wikipedia title (or display name) -> reason. Filled in after comparing with roster_mlb/npb.json.
MOVED_ABROAD = {}

_last = [0.0]
def api(**params):
    params.update(format='json', formatversion='2')
    url = f'https://{HOST}/w/api.php?' + urllib.parse.urlencode(params)
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(key):
        with open(key, encoding='utf-8') as f:
            return json.load(f)
    for attempt in range(6):
        wait = 3.0 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode('utf-8'))
            break
        except urllib.error.HTTPError as e:
            _last[0] = time.time()
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(int(e.headers.get('Retry-After') or 0) or 15 * (attempt + 1))
    _last[0] = time.time()
    with open(key, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    return data

def fetch_rosters():
    rosters, revisions = {}, {}
    for team_id, page in TEAM_PAGES.items():
        title = f'틀:{page} 명단'
        d = api(action='query', prop='revisions', titles=title, rvprop='content|timestamp|ids', rvslots='main')
        rev = d['query']['pages'][0]['revisions'][0]
        text = rev['slots']['main']['content']
        revisions[team_id] = {'title': title, 'revid': rev['revid'], 'timestamp': rev['timestamp']}
        group, entries = None, []
        for line in text.splitlines():
            m = re.match(r'\|묶음\d+\s*=\s*(.+)', line)
            if m:
                group = GROUPS.get(re.sub(r'<[^>]+>', '', m.group(1)).strip())
                continue
            m = re.match(r'\*\s*(\S+)\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', line)
            if m and group:
                no = m.group(1) if re.fullmatch(r'\d+', m.group(1)) else '—'
                entries.append({'no': no, 'link': m.group(2).strip(), 'name': (m.group(3) or m.group(2)).strip(), 'group': group})
        if not entries:
            raise SystemExit(f'{title}: no players parsed')
        rosters[team_id] = entries
    return rosters, revisions

def fetch_bios(titles):
    """Infobox fields for each Wikipedia title (missing pages map to None)."""
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        d = api(action='query', prop='revisions|info', titles='|'.join(titles[i:i + 50]), rvprop='content', rvslots='main', redirects=1)
        alias = {r['to']: r['from'] for r in d['query'].get('redirects', [])}
        alias.update({n['to']: n['from'] for n in d['query'].get('normalized', [])})
        for page in d['query']['pages']:
            title = page['title']
            src = alias.get(title, title)
            src = alias.get(src, src)
            if page.get('missing') or 'revisions' not in page:
                out[src] = None
                continue
            text = page['revisions'][0]['slots']['main']['content']
            out[src] = {'pageid': page['pageid'], **parse_infobox(text)}
    return out

def field(text, *names):
    for n in names:
        m = re.search(r'\|\s*' + n + r'\s*=\s*([^\n]*)', text)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return ''

def parse_infobox(text):
    born = field(text, '출생일', '생년월일')
    m = re.search(r'(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})', born) or re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', born)
    birth = f'{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}' if m else None
    bt = field(text, '투타')
    throws = 'L' if bt.startswith('좌투') else 'R' if bt.startswith('우투') else None
    bats = 'S' if '양타' in bt else 'L' if bt.endswith('좌타') else 'R' if bt.endswith('우타') else None
    nation_text = field(text, '국적')
    origin = next((code for k, code in NATION.items() if k in nation_text), 'INTL' if nation_text else None)
    pos_text = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', field(text, '포지션'))
    positions = []
    for word in re.split(r'[,，/·\s]+', pos_text):
        p = INFOBOX_POS.get(word.strip())
        if p and p not in positions:
            positions.append(p)
    return {'birth_date': birth, 'throws': throws, 'bats': bats, 'origin': origin, 'positions': positions}

def fetch_fa_pending(year):
    """Players who filed for free agency after the season and have not signed yet.
    They are off every club roster template while the market is open, so the game keeps them
    on their previous club (the game runs its own free agency later)."""
    d = api(action='query', prop='revisions', titles='KBO 리그 FA', rvprop='content|timestamp|ids', rvslots='main')
    rev = d['query']['pages'][0]['revisions'][0]
    text = rev['slots']['main']['content']
    m = re.search(r'===\s*' + str(year) + r'년 시즌\s*후[^=]*===(.*?)(?:\n==|\{\{위키데이터|\[\[분류)', text, re.S)
    if not m:
        raise SystemExit(f'KBO 리그 FA: no {year} section')
    pending = []
    for line in m.group(1).splitlines():
        e = re.match(r'\*\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\](.*)', line.strip())
        if e and not e.group(3).strip():  # a note means he already signed (and is on a roster)
            pending.append({'link': e.group(1).strip(), 'name': (e.group(2) or e.group(1)).strip()})
    return pending, {'title': 'KBO 리그 FA', 'revid': rev['revid'], 'timestamp': rev['timestamp']}

def pct(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, max(0, round(q * (len(values) - 1))))] if values else 45

def stable(ident, salt, spread=3):
    h = int(hashlib.sha1(f'{ident}|{salt}'.encode()).hexdigest()[:8], 16)
    return h % (2 * spread + 1) - spread

def estimate_ratings(base_players, pid, pitcher, kind):
    """Percentile of last season's KBO players of the same type, plus a fixed per-player wobble.
    import (foreign) ~70th pct, asia quota ~60th, returnee/transfer ~40th, rookie ~20th."""
    q = {'import': .7, 'asia': .6, 'veteran': .4, 'rookie': .2}[kind]
    keys = ('stuff', 'control', 'movement') if pitcher else ('contact', 'power', 'eye', 'speed', 'defense')
    pool = [p for p in base_players if (p['position'] == 'P') == pitcher and p['ratings_source'] != 'estimate_no_kbo_stats']
    ratings = {k: max(20, min(80, pct([p['ratings'][k] for p in pool if k in p['ratings']], q) + stable(pid, k))) for k in keys}
    if pitcher:
        ratings['stamina'] = 30
    return ratings

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    with open(BASE, encoding='utf-8') as f:
        base = json.load(f)
    old = base['players']
    by_name = collections.defaultdict(list)
    for p in old:
        by_name[p['source_name']].append(p)
    rosters, revisions = fetch_rosters()
    year = int(SNAPSHOT[:4])
    kept, new_entries, ambiguous = [], [], []
    used = set()
    entries = [(team_id, e) for team_id, es in rosters.items() for e in es if e['link'] not in MOVED_ABROAD and e['name'] not in MOVED_ABROAD]

    def candidates(team_id, e, birth=None, same_team=False):
        cands = [p for p in by_name.get(e['name'], []) if p['id'] not in used]
        hint = re.search(r'\((\d{4})년', e['link'])
        if hint:  # the link names a birth year: only that player can match, never a namesake
            cands = [p for p in cands if (p['birth_date'] or '')[:4] == hint.group(1)]
        if birth:  # the article's birth date is decisive
            cands = [p for p in cands if p['birth_date'] == birth]
        if same_team:
            cands = [p for p in cands if p['team_id'] == team_id]
        # A pitcher usually stays a pitcher; prefer that side of the ball when there is a choice.
        return [p for p in cands if (p['position'] == 'P') == (e['group'] == 'P')] or cands

    def take(team_id, e, cands):
        if len(cands) > 1:
            ambiguous.append((team_id, e['name'], [p['id'] for p in cands]))
        used.add(cands[0]['id'])
        kept.append((team_id, e, cands[0]))

    # Pass 1: players who stayed with their club.
    rest = []
    for team_id, e in entries:
        cands = candidates(team_id, e, same_team=True)
        if cands:
            take(team_id, e, cands)
        else:
            rest.append((team_id, e))
    # Pass 2: players who changed clubs, matched by the birth date in their article when there is one.
    rest_bios = fetch_bios([e['link'] for _, e in rest if by_name.get(e['name'])])
    for team_id, e in rest:
        bio = rest_bios.get(e['link']) if by_name.get(e['name']) else None
        cands = candidates(team_id, e, birth=(bio or {}).get('birth_date'))
        if cands:
            take(team_id, e, cands)
        else:
            new_entries.append((team_id, e))
    pending, fa_rev = fetch_fa_pending(year)
    fa_kept = []
    for e in pending:
        cands = [p for p in by_name.get(e['name'], []) if p['id'] not in used]
        hint = re.search(r'\((\d{4})년', e['link'])
        if hint:
            cands = [p for p in cands if (p['birth_date'] or '')[:4] == hint.group(1)]
        if len(cands) == 1:
            used.add(cands[0]['id'])
            fa_kept.append(cands[0])
        elif cands:
            ambiguous.append(('FA', e['name'], [p['id'] for p in cands]))
    bios = fetch_bios([e['link'] for _, e in new_entries])
    players = []
    for team_id, e, p in kept:
        q = dict(p)
        q['team_id'] = team_id
        q['jersey_number'] = e['no']
        q['roster_source'] = 'kowiki_2026'
        players.append(q)
    for p in fa_kept:
        q = dict(p)
        q['jersey_number'] = '—'
        q['roster_source'] = 'kowiki_fa_pending_2026'
        players.append(q)
    new_log = []
    for team_id, e in new_entries:
        bio = bios.get(e['link']) or {}
        origin = bio.get('origin') or ('INTL' if ' ' in e['link'].split('(')[0].strip() else 'KOR')
        foreign = origin != 'KOR'
        pitcher = e['group'] == 'P'
        age = year - int(bio['birth_date'][:4]) if bio.get('birth_date') else None
        kind = ('asia' if origin in ('JPN', 'TWN') else 'import') if foreign else ('rookie' if age is None or age <= 21 else 'veteran')
        pid = f"kbo:wp{bio['pageid']}" if bio.get('pageid') else 'kbo:wn' + hashlib.sha1(f"{team_id}|{e['name']}".encode()).hexdigest()[:10]
        if pitcher:
            position, positions = 'P', ['P']
        else:
            spots = [s for s in bio.get('positions', []) if s not in ('P', 'IF', 'OF')]
            if e['group'] == 'C' and 'C' not in spots:
                spots = ['C'] + spots
            if not spots:
                spots = {'C': ['C'], 'IF': ['2B', '3B', '1B'], 'OF': ['LF', 'RF', 'CF']}[e['group']]
            position, positions = spots[0], spots + ['DH']
        name, translit = zh_name(e['name'], foreign)
        players.append({'id': pid, 'name': name, 'team_id': team_id, 'position': position, 'positions': positions,
                        'role': 'RP' if pitcher else None, 'ratings': estimate_ratings(old, pid, pitcher, kind), 'status': 'Active',
                        'source_name': e['name'], 'source_url': f"https://ko.wikipedia.org/wiki/{urllib.parse.quote(e['link'].replace(' ', '_'))}",
                        'jersey_number': e['no'], 'birth_date': bio.get('birth_date'), 'throws': bio.get('throws') or 'R', 'bats': bio.get('bats') or 'R',
                        'name_transliterated': translit, 'origin': origin, 'positions_source': 'kowiki_infobox' if bio.get('positions') else 'kowiki_roster_group',
                        'ratings_source': f'estimate_new_2026_{kind}', 'roster_source': 'kowiki_2026'})
        new_log.append((team_id, e['name'], name, origin, kind, bio.get('birth_date')))
    # Wikipedia lists development players too (up to ~105 per club). Keep at most MAX_ROSTER per club
    # so world saves stay small: drop the weakest players who have no stats (estimated rookies and
    # returnees) first, but never below two players per field position or twelve pitchers.
    trimmed = []
    for team_id in TEAM_PAGES:
        club = [p for p in players if p['team_id'] == team_id]
        spare = sorted((p for p in club if p['ratings_source'] in ('estimate_new_2026_rookie', 'estimate_new_2026_veteran')),
                       key=lambda p: (p['ratings_source'] != 'estimate_new_2026_rookie', sum(p['ratings'].values()) / len(p['ratings'])))
        for p in spare:
            if len(club) <= MAX_ROSTER:
                break
            rest = [q for q in club if q is not p]
            if p['position'] == 'P' and sum(q['position'] == 'P' for q in rest) < 12:
                continue
            if p['position'] != 'P' and any(sum(pos in q['positions'] for q in rest) < 2 for pos in p['positions'] if pos != 'DH'):
                continue
            club = rest
            trimmed.append(p)
    gone = {id(p) for p in trimmed}
    players = [p for p in players if id(p) not in gone]
    # Every club needs five starters: new imports/asia pitchers start, then the best relievers move up.
    for team_id in TEAM_PAGES:
        arms = [p for p in players if p['team_id'] == team_id and p['position'] == 'P']
        for p in arms:
            if p['ratings_source'] in ('estimate_new_2026_import', 'estimate_new_2026_asia'):
                p['role'], p['ratings']['stamina'] = 'SP', 75
        starters = [p for p in arms if p['role'] == 'SP']
        rest = sorted((p for p in arms if p['role'] != 'SP'), key=lambda p: -sum(p['ratings'].get(k, 0) for k in ('stuff', 'control', 'movement')))
        for p in rest[:max(0, 5 - len(starters))]:
            p['role'], p['ratings']['stamina'] = 'SP', 75
    ids = [p['id'] for p in players]
    dupes = [i for i, n in collections.Counter(ids).items() if n > 1]
    if dupes:
        raise SystemExit(f'duplicate ids: {dupes[:5]}')
    removed = [p for p in old if p['id'] not in used]
    doc = {k: v for k, v in base.items() if k not in ('players',)}
    doc.update({
        'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'snapshot_date': SNAPSHOT,
        'ratings_note': '沿用 2025 名單的球員：打擊／投球能力依 2024–2025 韓職一軍成績換算（近年加權、樣本少者向平均回歸），守備依 2025 守備率估計。2026 新加入韓職的球員（新洋將、亞洲名額、新人、回歸者）沒有成績可用，能力為遊戲估計值。',
        'positions_note': '沿用球員的守位依 2025 守備出賽紀錄；新球員依維基百科資料的守位，沒有資料時依名單分類（內野／外野）估計。投手先發／後援分工為遊戲估計。維基名單含培育球員，每隊最多保留 70 人，略去能力最低、沒有成績資料的新人。',
        'source_note': f'2026 球季結束後的各隊名單取自韓文維基百科「各隊名單」模板（CC BY-SA，{min(r["timestamp"] for r in revisions.values())[:10]}～{max(r["timestamp"] for r in revisions.values())[:10]} 版本），新球員的生日、投打與國籍取自其維基百科條目；季後申請 FA 但尚未簽約的球員（維基百科「KBO 리그 FA」條目）暫列原球隊；能力沿用 KBO 官方紀錄（由開源專案 KBOFM2025 整理）的 2024–2025 成績。KBO 官網禁止未經核准的自動收集，因此未直接抓取。已轉戰美職或日職的球員已移除。非即時名單。',
        'roster_revisions': {**revisions, 'fa': fa_rev},
        'players': players,
    })
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(f'wrote {OUT}: {len(players)} players ({len(kept)} kept, {len(fa_kept)} unsigned FA kept, {len(new_entries)} new of which {len(trimmed)} trimmed, {len(removed)} removed)')
    print('per team', dict(collections.Counter(p['team_id'] for p in players)))
    if ambiguous:
        print('AMBIGUOUS', ambiguous)
    report = {'new': new_log, 'removed': [(p['team_id'], p['source_name'], p['name'], p['origin'], p['birth_date']) for p in removed]}
    with open(os.path.join(HERE, '.cache', 'kbo_update_report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()

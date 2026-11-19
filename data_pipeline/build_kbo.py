"""Builds dist/data/roster_kbo.json from KBO official records collected by the open-source
KBOFM2025 project (https://github.com/KBOFM2025/KBOFM2025, data/source/*.csv).

The KBO site itself is not reachable from the build sandbox, so this script reads a local
clone of that repository:

    git clone --depth 1 https://github.com/KBOFM2025/KBOFM2025 /tmp/KBOFM2025
    python data_pipeline/build_kbo.py /tmp/KBOFM2025

Ratings follow the NPB method in enrich_asia_ratings.py (recency-weighted 2024–2025 first-team
stats, regressed to a prior, calibrated to the MLB spread). Defense uses fielding percentage by
position. Names are a game transliteration into Chinese (see kbo_names_zh.py).
"""
import csv, json, os, statistics, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
import enrich_asia_ratings as E
from kbo_names_zh import zh_name

TEAMS = [
 ('KIA 타이거즈', 'HT', 'KIA老虎', 'KIA', '#EA0029'), ('삼성 라이온즈', 'SS', '三星獅', 'SS', '#074CA1'),
 ('LG 트윈스', 'LG', 'LG雙子', 'LG', '#C30452'), ('두산 베어스', 'OB', '斗山熊', 'OB', '#1A1748'),
 ('KT 위즈', 'KT', 'KT巫師', 'KT', '#231F20'), ('SSG 랜더스', 'SK', 'SSG登陸者', 'SSG', '#CE0E2D'),
 ('롯데 자이언츠', 'LT', '樂天巨人', 'LT', '#041E42'), ('한화 이글스', 'HH', '韓華鷹', 'HH', '#FF6600'),
 ('NC 다이노스', 'NC', 'NC恐龍', 'NC', '#315288'), ('키움 히어로즈', 'WO', '培證英雄', 'KW', '#820024'),
]
POS = {'포수': 'C', '1루수': '1B', '2루수': '2B', '3루수': '3B', '유격수': 'SS', '좌익수': 'LF', '중견수': 'CF', '우익수': 'RF'}
# Players on 2026 MLB rosters in this repo's MLB snapshot (moved after the 2025 KBO season).
MOVED_TO_MLB = {'위즈덤', '헤이수스', '로건', '앤더슨', '감보아', '폰세', '송성문'}
NUM = lambda v: float(v) if v not in (None, '', '-') else 0.0

def read(root, name):
    with open(os.path.join(root, 'data', 'source', name), encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))

def main(root):
    E.YEARS = {2025: 2, 2024: 1}
    roster = read(root, 'kbo_2025_final_roster.csv')
    team_of = {t[0]: t for t in TEAMS}
    teams = [{'id': f'kbo:{code}', 'name': zh, 'zh': zh, 'abbr': abbr, 'color': color, 'league': 'KBO',
              'source_url': 'https://www.koreabaseball.com/'} for _, code, zh, abbr, color in TEAMS]
    stats = {}
    for year in (2024, 2025):
        for row in read(root, f'kbo_{year}_first_team_hitting.csv'):
            b = stats.setdefault(row['kbo_player_id'], {'bat': {}, 'pit': {}})['bat'].setdefault(year, {k: 0.0 for k in ('pa', 'ab', 'h', 'd', 't', 'hr', 'sb', 'bb', 'hbp', 'so')})
            for k, src in (('pa', 'PA'), ('ab', 'AB'), ('h', 'H'), ('d', '2B'), ('t', '3B'), ('hr', 'HR'), ('sb', 'SB'), ('bb', 'BB'), ('hbp', 'HBP'), ('so', 'SO')):
                b[k] += NUM(row[src])
        for row in read(root, f'kbo_{year}_first_team_pitching.csv'):
            p = stats.setdefault(row['kbo_player_id'], {'bat': {}, 'pit': {}})['pit'].setdefault(year, {k: 0.0 for k in ('g', 'outs', 'bf', 'h', 'hr', 'bb', 'hbp', 'so', 'er')})
            for k, src in (('g', 'G'), ('outs', 'IP_OUTS'), ('bf', 'TBF'), ('h', 'H'), ('hr', 'HR'), ('bb', 'BB'), ('hbp', 'HBP'), ('so', 'SO'), ('er', 'ER')):
                p[k] += NUM(row[src])
    fielding = {}
    for row in read(root, 'kbo_2025_defense.csv'):
        pos = POS.get(row['defense_position'])
        if pos:
            fielding.setdefault(row['kbo_player_id'], []).append((pos, NUM(row['G']), NUM(row['FPCT']), NUM(row['CS_PCT']) if row['CS_PCT'] not in ('', '-') else None))
    players = []
    for r in roster:
        if r['name'] in MOVED_TO_MLB:
            continue
        t = team_of[r['team']]
        group = r['position_group']
        name, translit = zh_name(r['name'], r['is_foreign'] == '1')
        bt = r['bats_throws']
        throws = 'L' if bt.startswith('좌투') else 'R'
        bats = 'S' if '양타' in bt else 'L' if bt.endswith('좌타') else 'R'
        rows = sorted(fielding.get(r['kbo_player_id'], []), key=lambda x: -x[1])
        if group == 'P':
            position, positions = 'P', ['P']
        else:
            spots = [pos for pos, g, *_ in rows if g >= 10] or ([rows[0][0]] if rows else [])
            if group == 'C' and 'C' not in spots:
                spots = ['C'] + spots
            position = spots[0] if spots else group
            positions = (spots or [group]) + ['DH']
        players.append({'id': f"kbo:{r['kbo_player_id']}", 'name': name, 'team_id': f'kbo:{t[1]}', 'position': position, 'positions': positions,
                        'role': None, 'ratings': {}, 'status': 'Active', 'source_name': r['name'], 'source_url': r['source_url'],
                        'jersey_number': '—', 'birth_date': r['birth_date'] or None, 'throws': throws, 'bats': bats,
                        'name_transliterated': translit, 'origin': 'INTL' if r['is_foreign'] == '1' else 'KOR', 'positions_source': 'kbo_defense_2025' if rows else 'official_group'})
    parsed = {p['id']: stats.get(p['id'].split(':')[1], {'bat': {}, 'pit': {}}) for p in players}
    E.rate_npb(players, parsed)
    for p in players:
        if p['ratings_source'].startswith('npb'):
            p['ratings_source'] = 'kbo_stats_2024_2025'
        elif p['ratings_source'].startswith('estimate'):
            p['ratings_source'] = 'estimate_no_kbo_stats'
    E.calibrate(players, None)
    # Defense: fielding percentage z-score within each position (catchers add caught-stealing rate).
    by_pos = {}
    for pid, rows in fielding.items():
        for pos, g, fpct, cs in rows:
            if g >= 20:
                by_pos.setdefault(pos, []).append(fpct + (cs or 0) * .05 if pos == 'C' else fpct)
    z = {pos: E.zscorer(vals) for pos, vals in by_pos.items()}
    for p in players:
        if p['position'] == 'P':
            continue
        rows = sorted(fielding.get(p['id'].split(':')[1], []), key=lambda x: -x[1])
        if rows:
            pos, g, fpct, cs = rows[0]
            val = fpct + (cs or 0) * .05 if pos == 'C' else fpct
            p['ratings']['defense'] = E.finish(E.regress(E.to_rating(z[pos](val) if pos in z else 0), g, 60, 46))
        else:
            p['ratings']['defense'] = E.finish(44 + E.stable_noise(p['id'], 'def'))
    E.assign_roles(players)
    for p in players:
        if p['position'] != 'P':
            p['role'] = None
    E.summarize(players, 'KBO')
    doc = {'league': 'KBO', 'season': 2026, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'snapshot_date': '2025-10-31',
           'ratings_note': '打擊／投球能力依 2024–2025 韓職一軍成績（近年加權、樣本少者向平均回歸）換算；無一軍紀錄者為估計值。守備依 2025 守備率估計。',
           'positions_note': '守位依 2025 守備出賽紀錄；投手先發／後援分工為遊戲估計。',
           'source_note': 'KBO 官方紀錄（由開源專案 KBOFM2025 整理）；2025 球季結束時的登錄名單，不含 2026 新簽洋將與亞洲名額球員；已轉戰美職的球員（如龐塞、宋成文）已移除。非即時名單。',
           'name_note': '韓國球員姓名為遊戲依讀音轉寫的漢字，非官方漢字名（少數知名球員除外）；洋將為遊戲中文音譯。',
           'teams': teams, 'players': players}
    out = os.path.join(os.path.dirname(__file__), '..', 'dist', 'data', 'roster_kbo.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', out, len(players), 'players')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/KBOFM2025')

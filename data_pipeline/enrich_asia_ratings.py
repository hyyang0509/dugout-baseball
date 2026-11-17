"""Replace placeholder NPB/CPBL ratings with stats-based ratings (game estimates).

Reads the existing snapshots in dist/data (roster membership and IDs are NOT changed,
so saves stay compatible), fetches each player's PUBLIC page slowly, and rewrites
ratings, CPBL birth dates / handedness and pitcher roles.

Sources (public pages only; never the sites' /api/ endpoints):
- NPB: https://npb.jp/bis/players/<id>.html  yearly 1st-team (NPB) stats, 2024-2026.
- CPBL: https://stats.cpbl.com.tw/players/<acnt>  official percentile tables embedded in
  the page (season 2026, 1st team "A" and farm "D") plus birth date and handedness.

Usage (from repository root):
    python data_pipeline/enrich_asia_ratings.py [--delay 1.5] [--leagues npb cpbl]
Pages are cached in .cache/asia (gitignored); reruns reuse the cache unless --refresh.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import statistics
import sys
import time
from pathlib import Path
from statistics import NormalDist
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist' / 'data'
UA = 'DUGOUT roster snapshot/1.0 (personal hobby game; polite, cached)'
YEARS = {2026: 5, 2025: 4, 2024: 3}  # recency weights (Marcel-style)
NORMAL = NormalDist()


class Fetcher:
    def __init__(self, cache, delay, refresh):
        self.cache, self.delay, self.refresh = cache, delay, refresh
        self.cache.mkdir(parents=True, exist_ok=True)
        self.count = 0

    def get(self, url):
        key = self.cache / (hashlib.sha1(url.encode()).hexdigest() + '.html')
        if key.exists() and not self.refresh:
            return key.read_text(encoding='utf-8')
        for attempt in range(3):
            try:
                time.sleep(self.delay)
                with urlopen(Request(url, headers={'User-Agent': UA}), timeout=45) as r:
                    body = r.read().decode('utf-8')
                break
            except Exception as error:  # transient network errors: back off, retry
                if attempt == 2:
                    raise RuntimeError(f'fetch failed {url}: {error}') from error
                time.sleep(self.delay * 4 * (attempt + 1))
        key.write_text(body, encoding='utf-8')
        self.count += 1
        return body


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def to_rating(z, shift=0.0):
    return 50 + 8 * clamp(z, -3, 3.75) + shift


def regress(observed, n, k, prior):
    if observed is None or not n:
        return prior
    w = n / (n + k)
    return w * observed + (1 - w) * prior


def finish(value):
    return int(round(clamp(value, 25, 80)))


def stable_noise(ident, salt, spread=3):
    digest = hashlib.sha256(f'{ident}:{salt}'.encode()).digest()
    return digest[0] % (2 * spread + 1) - spread


# ----------------------------------------------------------------------------- NPB
def cells(row):
    return [re.sub(r'\s+', '', ''.join(c.itertext())) for c in row.xpath('./th|./td')]


def npb_innings(text):
    # NPB shows e.g. "186.1"; a pitcher who faced batters without recording an out shows "+".
    whole, _, frac = text.partition('.')
    whole, frac = re.sub(r'\D', '', whole), re.sub(r'\D', '', frac)
    return int(whole or 0) * 3 + int(frac or 0)


def parse_npb(page):
    from lxml import html
    doc = html.fromstring(page)
    out = {'bat': {}, 'pit': {}}
    for kind, table_id in (('bat', 'tablefix_b'), ('pit', 'tablefix_p')):
        tables = doc.xpath(f'//table[@id="{table_id}"]')
        if not tables:
            continue
        rows = tables[0].xpath('./tr|./tbody/tr|./thead/tr')
        head = cells(rows[0])
        for row in rows[1:]:
            values = cells(row)
            if len(values) < len(head) or not values[0].isdigit():
                continue
            year = int(values[0])
            if year not in YEARS:
                continue
            rec = dict(zip(head, values))
            num = lambda k: float(rec.get(k) or 0) if re.fullmatch(r'[\d.]+', rec.get(k) or '') else 0.0
            if kind == 'bat':
                stats = dict(pa=num('打席'), ab=num('打数'), h=num('安打'), d=num('二塁打'), t=num('三塁打'),
                             hr=num('本塁打'), sb=num('盗塁'), bb=num('四球'), hbp=num('死球'), so=num('三振'))
            else:
                stats = dict(g=num('登板'), outs=npb_innings(rec.get('投球回', '0')), bf=num('打者'), h=num('安打'),
                             hr=num('本塁打'), bb=num('四球'), hbp=num('死球'), so=num('三振'), er=num('自責点'))
            bucket = out[kind].setdefault(year, {k: 0.0 for k in stats})
            for k, v in stats.items():  # mid-season trades produce two rows per year
                bucket[k] += v
    return out


def pooled(seasons):
    total, weight_sum = {}, 0
    for year, stats in seasons.items():
        w = YEARS[year]
        for k, v in stats.items():
            total[k] = total.get(k, 0) + w * v
        weight_sum += w
    if not weight_sum:
        return None
    # Recency-weighted totals rescaled to the actual multi-season volume (rates unchanged).
    mean_weight = weight_sum / len(seasons)
    return {k: v / mean_weight for k, v in total.items()}


def zscorer(values):
    xs = [v for v in values if v is not None]
    if len(xs) < 5:
        return lambda v: 0.0
    mu, sd = statistics.mean(xs), statistics.pstdev(xs) or 1.0
    return lambda v: 0.0 if v is None else (v - mu) / sd


def rate_npb(players, parsed):
    bat_lines, pit_lines = {}, {}
    for p in players:
        stats = parsed.get(p['id']) or {'bat': {}, 'pit': {}}
        if p['position'] == 'P':
            pit_lines[p['id']] = pooled(stats['pit'])
        else:
            bat_lines[p['id']] = pooled(stats['bat'])

    # Batting rates among players with a meaningful sample define the league scale.
    def bat_rates(s):
        if not s or s['pa'] < 1:
            return None
        singles = s['h'] - s['d'] - s['t'] - s['hr']
        on = singles + s['bb'] + s['hbp']
        return dict(avg=s['h'] / max(s['ab'], 1), k=-s['so'] / s['pa'],
                    iso=(s['d'] + 2 * s['t'] + 3 * s['hr']) / max(s['ab'], 1), hr=s['hr'] / s['pa'],
                    bb=s['bb'] / s['pa'], spd=(s['sb'] + 2 * s['t']) / max(on + s['t'], 1))
    brates = {pid: bat_rates(s) for pid, s in bat_lines.items()}
    qualified = [r for pid, r in brates.items() if r and bat_lines[pid]['pa'] >= 150]
    bz = {key: zscorer([r[key] for r in qualified]) for key in ('avg', 'k', 'iso', 'hr', 'bb', 'spd')}

    def pit_rates(s):
        if not s or s['bf'] < 1:
            return None
        bip = max(s['bf'] - s['so'] - s['bb'] - s['hbp'] - s['hr'], 1)
        return dict(k=s['so'] / s['bf'], bb=-(s['bb'] + s['hbp']) / s['bf'], hr=-s['hr'] / s['bf'],
                    hbip=-(s['h'] - s['hr']) / bip, ipg=s['outs'] / 3 / max(s['g'], 1))
    prates = {pid: pit_rates(s) for pid, s in pit_lines.items()}
    pq = [r for pid, r in prates.items() if r and pit_lines[pid]['bf'] >= 120]
    pz = {key: zscorer([r[key] for r in pq]) for key in ('k', 'bb', 'hr', 'hbip')}

    for p in players:
        prior = 42 + stable_noise(p['id'], 'prior')
        if p['position'] == 'P':
            s, r = pit_lines.get(p['id']), prates.get(p['id'])
            n = s['bf'] if s else 0
            if r:
                p['ratings']['stuff'] = finish(regress(to_rating(pz['k'](r['k'])), n, 160, prior))
                p['ratings']['control'] = finish(regress(to_rating(pz['bb'](r['bb'])), n, 200, prior))
                move = (pz['hr'](r['hr']) + 0.5 * pz['hbip'](r['hbip'])) / 1.5
                p['ratings']['movement'] = finish(regress(to_rating(move), n, 300, prior))
                p['_starter_score'] = (r['ipg'], s['outs'])
                p['ratings_source'] = 'npb_stats_2024_2026'
            else:
                for key in ('stuff', 'control', 'movement'):
                    p['ratings'][key] = finish(prior + stable_noise(p['id'], key))
                p['_starter_score'] = (0, 0)
                p['ratings_source'] = 'estimate_no_npb_stats'
        else:
            s, r = bat_lines.get(p['id']), brates.get(p['id'])
            n = s['pa'] if s else 0
            if r:
                p['ratings']['contact'] = finish(regress(to_rating((bz['avg'](r['avg']) + bz['k'](r['k'])) / 2 * 1.2), n, 220, prior))
                p['ratings']['power'] = finish(regress(to_rating((bz['iso'](r['iso']) + bz['hr'](r['hr'])) / 2 * 1.1), n, 200, prior))
                p['ratings']['eye'] = finish(regress(to_rating(bz['bb'](r['bb'])), n, 250, prior))
                p['ratings']['speed'] = finish(regress(to_rating(bz['spd'](r['spd'])), n, 250, 46))
                p['ratings_source'] = 'npb_stats_2024_2026'
            else:
                for key in ('contact', 'power', 'eye'):
                    p['ratings'][key] = finish(prior + stable_noise(p['id'], key))
                p['ratings']['speed'] = finish(46 + stable_noise(p['id'], 'speed', 5))
                p['ratings_source'] = 'estimate_no_npb_stats'


# ----------------------------------------------------------------------------- CPBL
def cpbl_flight(page):
    from lxml import html
    doc = html.fromstring(page)
    flight = ''
    for script in doc.xpath('//script[not(@src)]/text()'):
        if script.startswith('self.__next_f.push([1,'):
            flight += json.loads(script[len('self.__next_f.push('):-1])[1]
    return flight


def cpbl_queries(flight):
    """Yield (queryKey, data) for every dehydrated react-query entry in the page."""
    decoder = json.JSONDecoder()
    for m in re.finditer(r'\{"dehydratedAt":', flight):
        try:
            obj, _ = decoder.raw_decode(flight, m.start())
        except ValueError:
            continue
        key = obj.get('queryKey')
        data = obj.get('state', {}).get('data')
        if key:
            yield key, data


def parse_cpbl(page):
    detail, tables = None, {}
    for key, data in cpbl_queries(cpbl_flight(page)):
        if key[0] == 'player-detail':
            detail = (((data or {}).get('data') or {}).get('player') or {}).get('basic')
        elif key[0] in ('season-pr-table', 'pr-table') and len(key) > 1 and isinstance(key[1], dict):
            # Player pages embed the season table as a list; the rankings page wraps it.
            rows = data if isinstance(data, list) else (((data or {}).get('data') or {}).get('leaderboard'))
            if isinstance(rows, list) and key[1].get('year') == 2026 and not key[1].get('teamCode') and not key[1].get('month'):
                tables[(key[1].get('searchType'), key[1].get('gameKind'))] = rows
    return detail, tables


def rate_cpbl(players, details, tables):
    # pr = percentile 0-100 oriented so that higher is better for that player type.
    rows = {}
    for (kind, game_kind), table in tables.items():
        for row in table:
            acnt = (row.get('player') or {}).get('acnt')
            if acnt:
                rows.setdefault((kind, acnt), []).append((game_kind, row))

    def z(pr):
        return NORMAL.inv_cdf(clamp((pr if pr is not None else 50) / 100, 0.01, 0.99))

    def blended(kind, acnt, fields):
        """PA-weighted rating from 1st team (A) and farm (D) tables; farm is shifted down."""
        total, weight = 0.0, 0.0
        for game_kind, row in rows.get((kind, acnt), []):
            pa = row.get('pa') or 0
            vals = [z(row.get(f)) for f in fields if row.get(f) is not None]
            if not pa or not vals:
                continue
            shift = 0 if game_kind == 'A' else -7
            total += pa * to_rating(sum(vals) / len(vals), shift)
            weight += pa
        return (total / weight, weight) if weight else (None, 0)

    for p in players:
        acnt = p['id'].split(':', 1)[1]
        basic = details.get(acnt) or {}
        if basic.get('birthDate'):
            p['birth_date'] = basic['birthDate'][:10]
        hand = {'R': 'R', 'L': 'L', 'S': 'S', 'B': 'S'}
        if basic.get('pitchingHabbit') in hand:
            p['throws'] = hand[basic['pitchingHabbit']]
        if basic.get('strikeHabbit') in hand:
            p['bats'] = hand[basic['strikeHabbit']]
        prior = 42 + stable_noise(p['id'], 'prior')
        if p['position'] == 'P':
            spec = {'stuff': (['kpPr', 'whiffpPr'], 150), 'control': (['bbpPr'], 200),
                    'movement': (['wobaPr', 'hardHitpPr', 'evPr'], 250)}
            kind = 'pitcher'
        else:
            spec = {'contact': (['baPr', 'kpPr'], 200), 'power': (['isoPr', 'evPr', 'prlpPr'], 180),
                    'eye': (['bbpPr', 'chasepPr'], 220)}
            kind = 'batter'
        seen = False
        for key, (fields, k) in spec.items():
            observed, n = blended(kind, acnt, fields)
            seen = seen or n > 0
            p['ratings'][key] = finish(regress(observed, n, k, prior) if n else prior + stable_noise(p['id'], key))
        if p['position'] != 'P':
            p['ratings']['speed'] = finish(46 + stable_noise(p['id'], 'speed', 5))
        p['ratings_source'] = 'cpbl_official_percentiles_2026' if seen else 'estimate_no_cpbl_data'
        if p['position'] == 'P':
            faced = sum((row.get('pa') or 0) * (1 if gk == 'A' else 0.4) for gk, row in rows.get(('pitcher', acnt), []))
            p['_starter_score'] = (faced, 0)


def assign_roles(players):
    by_team = {}
    for p in players:
        if p['position'] == 'P':
            by_team.setdefault(p['team_id'], []).append(p)
    for pitchers in by_team.values():
        pitchers.sort(key=lambda p: (p.get('_starter_score', (0, 0)), sum(p['ratings'].get(k, 0) for k in ('stuff', 'control', 'movement'))), reverse=True)
        for i, p in enumerate(pitchers):
            p['role'] = 'SP' if i < 5 else 'RP'
            p['ratings']['stamina'] = 75 if i < 5 else 30
    for p in players:
        p.pop('_starter_score', None)


def calibrate(players, before):
    """Rescale stat-based ratings to the MLB snapshot's spread (p50≈50, p10≈41, p90≈60).

    Regression toward the prior keeps the ORDER right but compresses the range; this
    linear rescale restores star/bench separation within each league. Players without
    data keep their below-average estimate. `before` holds the original ratings so that
    unrelated keys (defense, speed placeholders) are left untouched.
    """
    keys = ('contact', 'power', 'eye', 'stuff', 'control', 'movement')
    rated = [p for p in players if not p['ratings_source'].startswith('estimate')]
    for key in keys:
        group = [p for p in rated if key in p['ratings']]
        xs = [p['ratings'][key] for p in group]
        if len(xs) < 10:
            continue
        mu, sd = statistics.mean(xs), statistics.pstdev(xs) or 1.0
        for p in group:
            p['ratings'][key] = finish(49 + (p['ratings'][key] - mu) * 7.8 / sd)


def summarize(players, league):
    sources = {}
    for p in players:
        sources[p['ratings_source']] = sources.get(p['ratings_source'], 0) + 1
    print(league, 'ratings sources:', sources)
    for key in ('contact', 'power', 'eye', 'stuff', 'control', 'movement'):
        xs = sorted(p['ratings'][key] for p in players if key in p['ratings'])
        if xs:
            n = len(xs)
            print(f'  {key:9s} n={n} p10={xs[n // 10]} p50={xs[n // 2]} p90={xs[9 * n // 10]} max={xs[-1]}')


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--leagues', nargs='+', default=['npb', 'cpbl'])
    ap.add_argument('--delay', type=float, default=1.5)
    ap.add_argument('--cache', type=Path, default=ROOT / '.cache' / 'asia')
    ap.add_argument('--refresh', action='store_true')
    args = ap.parse_args(argv)

    jobs = {}
    docs = {lg: json.loads((DATA / f'roster_{lg}.json').read_text(encoding='utf-8')) for lg in args.leagues}

    def run_npb():
        f = Fetcher(args.cache / 'npb', args.delay, args.refresh)
        parsed = {}
        for i, p in enumerate(docs['npb']['players'], 1):
            parsed[p['id']] = parse_npb(f.get(p['source_url']))
            if i % 100 == 0:
                print(f'NPB {i}/{len(docs["npb"]["players"])} (network {f.count})', flush=True)
        return parsed

    def run_cpbl():
        f = Fetcher(args.cache / 'cpbl', args.delay, args.refresh)
        details, tables = {}, {}
        for i, p in enumerate(docs['cpbl']['players'], 1):
            acnt = p['id'].split(':', 1)[1]
            detail, found = parse_cpbl(f.get(f'https://stats.cpbl.com.tw/players/{acnt}'))
            if detail:
                details[acnt] = detail
            for key, rows in found.items():
                if len(rows) > len(tables.get(key, [])):
                    tables[key] = rows
            if i % 100 == 0:
                print(f'CPBL {i}/{len(docs["cpbl"]["players"])} (network {f.count})', flush=True)
        # The public rankings page carries the full 1st-team batter table.
        _, found = parse_cpbl(f.get('https://stats.cpbl.com.tw/rankings'))
        for key, rows in found.items():
            if len(rows) > len(tables.get(key, [])):
                tables[key] = rows
        return details, tables

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:  # one worker per host
        if 'npb' in docs:
            jobs['npb'] = pool.submit(run_npb)
        if 'cpbl' in docs:
            jobs['cpbl'] = pool.submit(run_cpbl)
        results = {k: v.result() for k, v in jobs.items()}

    if 'npb' in results:
        players = docs['npb']['players']
        rate_npb(players, results['npb'])
        calibrate(players, None)
        assign_roles(players)
        docs['npb']['ratings_note'] = '打擊／投球能力依 2024–2026 日職一軍成績（近年加權、樣本少者向平均回歸）換算；無一軍紀錄者為估計值。守備能力仍為遊戲估計。'
        summarize(players, 'NPB')
    if 'cpbl' in results:
        details, tables = results['cpbl']
        print('CPBL tables:', {f'{k[0]}/{k[1]}': len(v) for k, v in tables.items()}, 'details:', len(details))
        if not any(k[1] == 'A' for k in tables):
            sys.exit('CPBL 1st-team percentile tables missing; refusing to write.')
        players = docs['cpbl']['players']
        rate_cpbl(players, details, tables)
        calibrate(players, None)
        assign_roles(players)
        docs['cpbl']['ratings_note'] = '打擊／投球能力依中職官方 2026 球季百分位數據（一軍為主、二軍降級計入、樣本少者向平均回歸）換算；無資料者為估計值。速度與守備仍為遊戲估計。'
        summarize(players, 'CPBL')

    for lg, doc in docs.items():
        tmp = DATA / f'roster_{lg}.json.tmp'
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp.replace(DATA / f'roster_{lg}.json')
        print('wrote', lg)


if __name__ == '__main__':
    main()

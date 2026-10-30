#!/usr/bin/env python3
"""Merge fielding eligibility from a full pipeline JSON into a compact game JSON.

python data_pipeline/enrich_positions.py --source public/data/roster_mlb.json \\
    --target dist/data/roster_mlb.json
Requires the source produced by fetch_rosters.py (including season_stats).
"""
import argparse
import json
from pathlib import Path

ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--target', type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.source.read_text(encoding='utf-8'))
    target = json.loads(args.target.read_text(encoding='utf-8'))
    lookup = {p['id']: p for p in source['players']}
    for player in target['players']:
        raw = lookup[player['id']]
        evidence = {}
        for row in raw['season_stats']:
            if row['group'] == 'fielding' and row.get('position') in ORDER:
                evidence.setdefault(row['position'], set()).add(row['season'])
        positions = set(evidence)
        if player['position'] in ORDER:
            positions.add(player['position'])
        if player['position'] == 'OF':
            positions.update(['LF', 'CF', 'RF'])
        if player['position'] == 'IF':
            positions.update(['1B', '2B', '3B', 'SS'])
        if player['position'] == 'TWP':
            positions.update(['P', 'DH'])
        if 'contact' in player['ratings']:
            positions.add('DH')
        player['positions'] = sorted(positions, key=ORDER.index)
        player['position_evidence'] = {pos: sorted(years) for pos, years in evidence.items()}
        player['positions_note'] = '主守位及近三季 MLB 守備出賽紀錄；打者皆可 DH。出賽紀錄不代表各守位能力相同。'
    temporary = args.target.with_suffix('.tmp')
    temporary.write_text(json.dumps(target, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(args.target)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Fetch MLB/CPBL rosters and map regular-season counting stats to 20–80.

Python 3.10+; pip install requests beautifulsoup4
See README.md for model assumptions, scope, JSON contract and limitations.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import re
import statistics
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

LOG = logging.getLogger(__name__)
MLB = "https://statsapi.mlb.com/api/v1"
CPBL = "https://www.cpbl.com.tw"
CPBL_TEAMS = {
    "AAA": "味全龍", "ACN": "中信兄弟", "ADD": "統一7-ELEVEn獅",
    "AEO": "富邦悍將", "AJL": "樂天桃猿", "AKP": "台鋼雄鷹",
}
POSITIONS = {
    "投手": "P", "捕手": "C", "一壘手": "1B", "二壘手": "2B",
    "三壘手": "3B", "游擊手": "SS", "左外野手": "LF", "中外野手": "CF",
    "右外野手": "RF", "外野手": "OF", "內野手": "IF", "指定打擊": "DH",
}
# Only additive counts are pooled; baseball innings are converted to OUTS first.
FIELDS = {
    "hitting": ("plateAppearances", "atBats", "hits", "doubles", "triples",
                "homeRuns", "baseOnBalls", "strikeOuts", "stolenBases", "caughtStealing"),
    "pitching": ("outs", "gamesPitched", "gamesStarted", "saves", "baseOnBalls",
                 "strikeOuts", "homeRuns", "groundOuts", "airOuts"),
    "fielding": ("putOuts", "assists", "errors"),
}
HEADER_MAP = {
    "打席": "plateAppearances", "打數": "atBats", "安打": "hits",
    "二安": "doubles", "三安": "triples", "全壘打": "homeRuns",
    "四壞": "baseOnBalls", "被三振": "strikeOuts", "奪三振": "strikeOuts",
    "三振": "strikeOuts", "盜壘": "stolenBases", "盜壘刺": "caughtStealing",
    "出賽數": "gamesPitched", "先發": "gamesStarted", "先發場數": "gamesStarted",
    "救援成功": "saves", "被全壘打": "homeRuns", "滾地出局": "groundOuts",
    "高飛出局": "airOuts", "刺殺": "putOuts", "助殺": "assists", "失誤": "errors",
}


class PipelineError(RuntimeError):
    """An upstream response is unavailable, incomplete, or no longer understood."""


def number(value):
    if value is None:
        return None
    try:
        n = float(str(value).replace(",", "").strip())
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def innings_to_outs(value):
    """123.1 means 370 outs, NOT 123.1 decimal innings."""
    if value is None or str(value).strip() in ("", "-", "--"):
        return None
    match = re.fullmatch(r"(\d+)(?:\.([012]))?", str(value).strip())
    if not match:
        raise PipelineError(f"Invalid baseball innings: {value!r}")
    return int(match[1]) * 3 + int(match[2] or 0)


class Client:
    def __init__(self, cache_dir: Path, timeout=30, delay=0.35, refresh=False):
        self.cache_dir, self.timeout, self.delay = cache_dir, timeout, delay
        self.refresh = refresh
        self.sources = set()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "BaseballSimRosterPipeline/1.0",
                                     "Accept-Language": "zh-TW,en;q=0.8"})
        retry = Retry(total=3, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504),
                      allowed_methods=("GET",), respect_retry_after_header=True)
        self.session.mount("https://", HTTPAdapter(max_retries=retry))

    def get(self, url, params=None, as_json=False):
        prepared = requests.Request("GET", url, params=params).prepare().url
        self.sources.add(prepared)
        key = hashlib.sha256(prepared.encode()).hexdigest()
        path = self.cache_dir / f"{key}.txt"
        # A six-hour cache avoids repeated scraping but never silently uses stale data.
        if not self.refresh and path.exists() and time.time() - path.stat().st_mtime < 21600:
            body = path.read_text(encoding="utf-8")
        else:
            if urlparse(url).hostname.endswith("cpbl.com.tw"):
                time.sleep(self.delay)
            try:
                r = self.session.get(url, params=params, timeout=self.timeout)
                r.raise_for_status()
                r.encoding = "utf-8"
                body = r.text
                if as_json:
                    r.json()  # Do not cache an HTML block page as JSON.
                elif "<html" not in body.lower() and "<table" not in body.lower():
                    raise PipelineError(f"Expected HTML, got an unexpected response: {prepared}")
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                path.write_text(body, encoding="utf-8")
            except (requests.RequestException, ValueError) as exc:
                raise PipelineError(f"Fetch failed: {prepared}: {exc}") from exc
        if as_json:
            try:
                return json.loads(body)
            except ValueError as exc:
                raise PipelineError(f"Invalid JSON: {prepared}") from exc
        return body


def base_player(league, ident, name, team, position, **extra):
    return {"id": f"{league.lower()}:{ident}", "source_id": str(ident), "name": name,
            "team_id": team["id"], "position": position, "status": "registered",
            "season_stats": [], **extra}


def mlb_stat_rows(person, seasons):
    rows = []
    for block in person.get("stats", []):
        group = block.get("group", {}).get("displayName")
        if group not in FIELDS:
            continue
        candidates = []
        for split in block.get("splits", []):
            year = int(split.get("season", 0))
            if year not in seasons or split.get("gameType", "R") != "R":
                continue
            if split.get("sport", {}).get("id", 1) != 1:
                continue
            if split.get("league", {}).get("id") not in (None, 103, 104):
                continue
            candidates.append(split)
        # Totals and team stints may coexist: use stints OR a single total per year.
        for year in seasons:
            subset = [s for s in candidates if int(s["season"]) == year]
            stints = [s for s in subset if s.get("team", {}).get("id")]
            chosen = stints or subset[:1]
            seen = set()
            for split in chosen:
                stat = dict(split["stat"])
                if group == "pitching":
                    stat["outs"] = innings_to_outs(stat.get("inningsPitched"))
                position = split.get("position", {}).get("abbreviation")
                key = (split.get("team", {}).get("id"), position, json.dumps(stat, sort_keys=True))
                if key in seen:
                    continue
                seen.add(key)
                rows.append({"season": year, "group": group, "position": position,
                             "stats": {k: number(stat.get(k)) for k in FIELDS[group]}})
    return rows


def fetch_mlb(client, season, seasons, roster_type):
    data = client.get(f"{MLB}/teams", {"sportId": 1, "season": season}, as_json=True)
    teams = [{"id": f"mlb:{t['id']}", "source_id": str(t["id"]), "name": t["name"]}
             for t in data.get("teams", []) if t.get("sport", {}).get("id") == 1]
    if len(teams) != 30:
        raise PipelineError(f"MLB expected 30 teams, received {len(teams)}")
    players = {}
    for team in teams:
        doc = client.get(f"{MLB}/teams/{team['source_id']}/roster",
                         {"rosterType": roster_type, "season": season, "hydrate": "person"}, True)
        roster = doc.get("roster", [])
        if not roster:
            raise PipelineError(f"Empty MLB roster: {team['name']}")
        for entry in roster:
            p = entry["person"]
            ident = p["id"]
            if ident in players:
                raise PipelineError(f"Player {ident} appears on two MLB rosters; rerun later")
            players[ident] = base_player(
                "MLB", ident, p["fullName"], team, entry["position"]["abbreviation"],
                jersey_number=entry.get("jerseyNumber"),
                bats=p.get("batSide", {}).get("code"), throws=p.get("pitchHand", {}).get("code"),
                birth_date=p.get("birthDate"), status=entry.get("status", {}).get("description", "registered"))
    ids = sorted(players)
    for start in range(0, len(ids), 40):
        batch = ids[start:start + 40]
        doc = client.get(f"{MLB}/people", {
            "personIds": ",".join(map(str, batch)),
            "hydrate": "stats(group=[hitting,pitching,fielding],type=[yearByYear])",
        }, True)
        people = {p["id"]: p for p in doc.get("people", [])}
        if set(people) != set(batch):
            raise PipelineError("MLB people response omitted roster members")
        for ident, person in people.items():
            players[ident]["season_stats"] = mlb_stat_rows(person, seasons)
    return teams, list(players.values())


def text(node):
    return " ".join(node.stripped_strings)


def clean_header(s):
    return re.sub(r"\s+", "", s).strip()


def cpbl_roster(html, team):
    soup = BeautifulSoup(html, "html.parser")
    found = {}
    # Player cards are links to official permanent Acnt identifiers. Never use names as IDs.
    for link in soup.find_all("a", href=True):
        url = urlparse(urljoin(CPBL, link["href"]))
        if url.hostname not in ("www.cpbl.com.tw", "cpbl.com.tw") or url.path.lower() != "/team/person":
            continue
        query = {k.lower(): v for k, v in parse_qs(url.query).items()}
        ident = query.get("acnt", [""])[0]
        if not ident:
            continue
        # Find the enclosing single-player card (rather than a whole roster section).
        card = link
        for parent in link.parents:
            if parent.name in ("li", "tr") or "item" in parent.get("class", []):
                card = parent
                break
            if parent.name in ("body", "html"):
                break
        content = text(card)
        heading = card.find_previous(["h2", "h3", "h4"])
        section = text(heading) if heading else ""
        if "教練" in content or "教練" in section:
            continue
        name_node = card.select_one(".name, .Name, .player_name")
        name = text(name_node) if name_node else text(link)
        name = re.sub(r"^[\d\s◎▲＊*]+", "", name).strip()
        if not name:
            image = link.find("img", alt=True)
            name = image["alt"].strip() if image else ""
        if not name or "{{" in name:
            continue
        position = next((code for label, code in POSITIONS.items() if label in content), None)
        if position is None:
            position = next((code for label, code in POSITIONS.items() if label in section), "UNK")
        if ident not in found:
            found[ident] = base_player("CPBL", ident, name, team, position,
                                       source_url=urljoin(CPBL, link["href"]))
        elif found[ident]["position"] == "UNK" and position != "UNK":
            found[ident]["position"] = position
    if not found:
        raise PipelineError(f"CPBL roster has no player cards: {team['name']} (blocked/changed HTML?)")
    return list(found.values())


def cpbl_stat_rows(html, seasons):
    """Parse career totals on the official player page, requested with KindCode=A.

    Require season columns and identifiable count headers; daily logs and rankings
    cannot pass this check. Prefer one season total over duplicate team stints.
    """
    soup = BeautifulSoup(html, "html.parser")
    parsed, recognized = [], False
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        headers, start = [], 0
        for i, tr in enumerate(trs):
            cells = tr.find_all(["th", "td"], recursive=False)
            values = [clean_header(text(c)) for c in cells]
            if any("年度" in v or v == "年份" for v in values):
                headers, start = values, i + 1
                break
        if not headers:
            continue
        if any("投球局數" == h or h == "局數" for h in headers):
            group = "pitching"
        elif "打數" in headers:
            group = "hitting"
        elif "刺殺" in headers and "失誤" in headers:
            group = "fielding"
        else:
            continue
        recognized = True
        year_index = next(i for i, h in enumerate(headers) if "年度" in h or h == "年份")
        for tr in trs[start:]:
            cells = tr.find_all(["td", "th"], recursive=False)
            if len(cells) != len(headers):
                continue
            values = [text(c) for c in cells]
            match = re.search(r"\b(20\d{2}|19\d{2})\b", values[year_index])
            if not match or int(match[1]) not in seasons:
                continue
            counts = {key: None for key in FIELDS[group]}
            for h, v in zip(headers, values):
                key = HEADER_MAP.get(h)
                if key in counts:
                    counts[key] = number(v)
                if group == "pitching" and h in ("投球局數", "局數"):
                    counts["outs"] = innings_to_outs(v)
            if all(v is None for v in counts.values()):
                raise PipelineError("CPBL season row contains no numeric counts")
            parsed.append({"season": int(match[1]), "group": group, "stats": counts,
                           "_total": any("合計" in v or "總計" in v for v in values),
                           "_key": tuple(values)})
    if not recognized:
        # A genuinely new player may have no rows, but an empty/block page must fail.
        if not soup.select_one(".PlayerBrief, .player_brief, .PlayerInfo"):
            raise PipelineError("CPBL career table absent: blocked, JS-only, or changed HTML")
        return []
    result = []
    for group in FIELDS:
        for year in seasons:
            subset = [r for r in parsed if r["group"] == group and r["season"] == year]
            totals = [r for r in subset if r["_total"]]
            seen = set()
            for row in totals[:1] or subset:
                if row["_key"] in seen:
                    continue
                seen.add(row["_key"])
                result.append({k: v for k, v in row.items() if not k.startswith("_")})
    return result


def fetch_cpbl(client, season, seasons):
    if season != datetime.now(timezone.utc).year:
        raise PipelineError("CPBL team pages expose CURRENT rosters only; historical --season is unsupported")
    teams, players, seen = [], [], set()
    for ident, name in CPBL_TEAMS.items():
        team = {"id": f"cpbl:{ident}", "source_id": ident, "name": name}
        teams.append(team)
        roster = cpbl_roster(client.get(f"{CPBL}/team", {"ClubNo": ident}), team)
        for p in roster:
            if p["id"] in seen:
                raise PipelineError(f"Duplicate CPBL player across teams: {p['id']}")
            seen.add(p["id"])
            html = client.get(f"{CPBL}/team/person", {"Acnt": p["source_id"], "KindCode": "A"})
            p["season_stats"] = cpbl_stat_rows(html, seasons)
            players.append(p)
    return teams, players


def pool(rows, group, seasons, weighted=True):
    selected = [r for r in rows if r["group"] == group and r["season"] in seasons]
    result = {}
    for field in FIELDS[group]:
        values = [(r["stats"].get(field), r["season"]) for r in selected]
        if not values or any(v is None for v, _ in values):
            result[field] = None
        else:
            result[field] = sum(v * (len(seasons) - (max(seasons) - y) if weighted else 1)
                                for v, y in values)
    return result


def ratio(a, b):
    return a / b if a is not None and b is not None and b > 0 else None


def metrics(player, seasons):
    h = pool(player["season_stats"], "hitting", seasons)
    p = pool(player["season_stats"], "pitching", seasons)
    f = pool(player["season_stats"], "fielding", seasons)
    avg = ratio(h["hits"], h["atBats"])
    extra = None if any(h[k] is None for k in ("doubles", "triples", "homeRuns")) else (
        h["doubles"] + 2 * h["triples"] + 3 * h["homeRuns"])
    chances = None if any(v is None for v in f.values()) else sum(f.values())
    field_pct = ratio(None if chances is None else chances - f["errors"], chances)
    return {
        "avg": avg, "k_pct": ratio(h["strikeOuts"], h["plateAppearances"]),
        "iso": ratio(extra, h["atBats"]), "hr_pct": ratio(h["homeRuns"], h["plateAppearances"]),
        "bb_pct": ratio(h["baseOnBalls"], h["plateAppearances"]),
        "bb_k": ratio(h["baseOnBalls"], h["strikeOuts"]),
        "sb_rate": ratio(h["stolenBases"], h["plateAppearances"]),
        "triple_rate": ratio(h["triples"], h["atBats"]),
        "field_pct": field_pct,
        "k9": ratio(None if p["strikeOuts"] is None else 27*p["strikeOuts"], p["outs"]),
        "bb9": ratio(None if p["baseOnBalls"] is None else 27*p["baseOnBalls"], p["outs"]),
        "hr9": ratio(None if p["homeRuns"] is None else 27*p["homeRuns"], p["outs"]),
    }


# GB% cannot be inferred from ground OUTS / air OUTS; velocity, DRS and UZR
# are intentionally omitted until a measured source is integrated.
FORMULAS = {
    "contact": (("avg", .7), ("k_pct", -.3)),
    "power": (("iso", .8), ("hr_pct", .2)),
    "eye": (("bb_pct", .8), ("bb_k", .2)),
    "speed": (("sb_rate", .8), ("triple_rate", .2)),
    "stuff": (("k9", 1.),), "control": (("bb9", -1.),),
    "movement": (("hr9", -1.),),
}


def bound(n):
    return max(20, min(80, int(math.floor(n + .5))))


def rate_players(players, seasons):
    """League-local reference distributions; empirical shrinkage for small samples."""
    values = {p["id"]: metrics(p, seasons) for p in players}
    references = {}
    for group, minimum, exposure in (("hitting", 100, "plateAppearances"), ("pitching", 90, "outs")):
        qualified = [p for p in players if (pool(p["season_stats"], group, seasons, False)[exposure] or 0) >= minimum]
        keys = {m for name, formula in FORMULAS.items()
                if (name in ("stuff", "control", "movement")) == (group == "pitching") for m, _ in formula}
        for key in sorted(keys):
            xs = [values[p["id"]][key] for p in qualified if values[p["id"]][key] is not None]
            references[key] = {"mean": statistics.mean(xs) if xs else None,
                               "sd": statistics.pstdev(xs) if len(xs) > 1 else 0, "n": len(xs)}
    def z(ident, key):
        v, ref = values[ident][key], references[key]
        if v is None or ref["n"] < 2 or not ref["sd"]:
            return None
        return (v - ref["mean"]) / ref["sd"]
    for p in players:
        h = pool(p["season_stats"], "hitting", seasons, False)
        pitch = pool(p["season_stats"], "pitching", seasons, False)
        has_h = (h["plateAppearances"] or 0) > 0
        has_p = (pitch["outs"] or 0) > 0
        is_p = p["position"] in ("P", "SP", "RP", "CL", "TWP") or has_p
        is_h = p["position"] not in ("P", "SP", "RP", "CL") or has_h
        ratings, quality = {}, {}
        for name, formula in FORMULAS.items():
            pitching = name in ("stuff", "control", "movement")
            if (pitching and not is_p) or (not pitching and not is_h):
                continue
            parts = [(score, weight) for key, weight in formula if (score := z(p["id"], key)) is not None]
            exposure = (pitch["outs"] if pitching else h["plateAppearances"]) or 0
            reliability = exposure / (exposure + (90 if pitching else 100))
            score = sum(s * w for s, w in parts) / sum(abs(w) for _, w in parts) if parts else 0
            ratings[name] = bound(50 + 10 * score * reliability)
            quality[name] = {"method": "estimated" if parts else "neutral_no_data",
                             "sample": exposure, "reliability": round(reliability, 4),
                             "used_metrics": [key for key, _ in formula if z(p["id"], key) is not None]}
        if is_h:
            # Fielding percentage comparisons only within the same position.
            peers = [values[q["id"]]["field_pct"] for q in players if q["position"] == p["position"]
                     and values[q["id"]]["field_pct"] is not None]
            fp = values[p["id"]]["field_pct"]
            sd = statistics.pstdev(peers) if len(peers) > 1 else 0
            f = pool(p["season_stats"], "fielding", seasons, False)
            n = sum(f.values()) if all(v is not None for v in f.values()) else 0
            if fp is not None and sd > 0:
                ratings["defense"] = bound(50 + 10 * (fp-statistics.mean(peers))/sd * n/(n+100))
                quality["defense"] = {"method": "fielding_percentage_proxy", "sample": n}
            else:
                ratings["defense"] = 35 if p["position"] == "DH" else 50
                quality["defense"] = {"method": "position_prior", "sample": n}
        if is_p:
            gs, games = pitch["gamesStarted"], pitch["gamesPitched"]
            sp_share = ratio(gs, games)
            if sp_share is None:
                p["role"], ratings["stamina"] = "P", 50
                quality["stamina"] = {"method": "neutral_no_data"}
            else:
                p["role"] = "SP" if sp_share >= .5 else "CL" if (pitch["saves"] or 0) >= 10 else "RP"
                ratings["stamina"] = bound(60 + 15 * sp_share) if p["role"] == "SP" else bound(30 + 15 * min(1, sp_share*2))
                quality["stamina"] = {"method": "role_prior", "starts_share": round(sp_share, 4)}
        p["ratings"], p["rating_quality"], p["metrics"] = ratings, quality, values[p["id"]]
    return references


def build_document(league, teams, players, season, seasons, sources, roster_type):
    if not players or not teams:
        raise PipelineError(f"Refusing to publish empty {league} data")
    if len({p["id"] for p in players}) != len(players):
        raise PipelineError("Duplicate player IDs")
    refs = rate_players(players, seasons)
    # Entirely missing stats usually means upstream schema changed. Never publish a fake roster.
    if not any(p["season_stats"] for p in players):
        raise PipelineError(f"No {league} season stats parsed; existing JSON is preserved")
    return {"schema_version": 1, "league": league, "season": season,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "roster_scope": roster_type if league == "MLB" else "current_registered_team_pages",
            "stats_seasons": sorted(seasons, reverse=True), "sources": sorted(sources),
            "rating_model": {"version": "mvp-1", "scale": [20, 80], "mean": 50,
                "z_score_sd": 10, "season_weights": {str(y): len(seasons)-(max(seasons)-y) for y in seasons},
                "reference_population": "current_roster_players_min_100_PA_or_90_outs",
                "references": refs, "small_sample_shrinkage": "n/(n+100 PA or 90 outs)",
                "limitations": ["League-relative; not cross-league talent comparisons",
                    "Proxy estimates, not official OOTP scouting grades",
                    "Velocity, GB%, DRS and UZR unavailable; omitted, never fabricated",
                    "Composite weights, sample shrinkage, clipping and priors change final SD",
                    "Speed uses SB/PA and triples/AB; defense uses position-local fielding percentage"]},
            "teams": sorted(teams, key=lambda t: t["id"]),
            "players": sorted(players, key=lambda p: (p["team_id"], p["id"]))}


def atomic_write(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=path.parent, encoding="utf-8", delete=False) as f:
            temporary = Path(f.name)
            json.dump(document, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--leagues", nargs="+", choices=("mlb", "cpbl"), default=["mlb", "cpbl"])
    parser.add_argument("--season", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--years", type=int, choices=(1, 2, 3), default=3)
    parser.add_argument("--roster-type", choices=("40Man", "active"), default="40Man")
    root = Path(__file__).resolve().parents[1]
    parser.add_argument("--output-dir", type=Path, default=root / "public/data")
    parser.add_argument("--cache-dir", type=Path, default=root / ".cache/rosters")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--cpbl-delay", type=float, default=.35)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args(argv)
    if args.season < 1990 or args.season > datetime.now(timezone.utc).year:
        parser.error("--season must be between 1990 and the current year")
    if args.timeout <= 0 or args.cpbl_delay < 0:
        parser.error("timeout must be positive and delay must be nonnegative")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    seasons = list(range(args.season-args.years+1, args.season+1))
    failed = False
    for league in dict.fromkeys(args.leagues):
        client = Client(args.cache_dir, args.timeout, args.cpbl_delay, args.refresh)
        try:
            if league == "mlb":
                teams, players = fetch_mlb(client, args.season, seasons, args.roster_type)
            else:
                teams, players = fetch_cpbl(client, args.season, seasons)
            document = build_document(league.upper(), teams, players, args.season, seasons,
                                      client.sources, args.roster_type)
            output = args.output_dir / f"roster_{league}.json"
            atomic_write(output, document)
            LOG.info("%s: %d teams, %d players -> %s", league.upper(), len(teams), len(players), output)
        except (PipelineError, KeyError, TypeError, ValueError, OSError) as exc:
            LOG.error("%s: %s (output not replaced)", league.upper(), exc)
            failed = True
        finally:
            client.session.close()
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Pick the card moments from the full WiseHockey match event file, then extract them.

The moments are chosen by rules over every shot in the match (see PICK_RULES), not by hand, so the same
script picks the cards for any game. The event CSV is confidential and must stay outside this repo. Point
the script at it with --csv or THINKSPORT_EVENTS_CSV. scripts/moments_config.local.json (gitignored) gives
the team names and an optional cross-check of the picks. Output goes to data/moments.json, also gitignored.

    python3 scripts/extract_moments.py --csv "/path/to/Match_Events.csv"

Standard library only. Coordinates are metres, rink centre at (0, 0).
"""
import argparse
import csv
import json
import math
import os
import sys

# Assumption, not yet verified: goal line at |x| = 26.5.
GOAL_LINE_X = 26.5

# Which moments to pull (id, period, match-clock seconds, event type, text that must appear in the primary
# player name or reason column, expected values to sanity-check) lives in a gitignored config, because it names
# real players and times from the confidential match. Shape: scripts/moments_config.example.json.
DEFAULT_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "moments_config.local.json")
TOLERANCE_S = 3


def to_xy(text):
    try:
        x, y = text.split(",")
        return float(x), float(y)
    except (ValueError, AttributeError):
        return None


def num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def snapshot(row):
    players = []
    for i in range(1, 13):
        xy = to_xy(row[f"StartPlayerCoordinates{i}"])
        if not row[f"StartPlayerId{i}"] or xy is None:
            continue
        players.append(dict(
            id=row[f"StartPlayerId{i}"], name=row[f"StartPlayerName{i}"],
            team=row[f"StartPlayerTeam{i}"], x=xy[0], y=xy[1],
            velocity=num(row[f"StartPlayerVelocity{i}"]),
            direction=num(row[f"StartPlayerDirection{i}"])))
    return players


def derive(row, players):
    """Distances for a shot. Goalie = the opposing skater furthest toward the attacked goal."""
    shooter_team = row["EventPrimaryTeam"]
    others = [p for p in players if p["team"] and p["team"] != shooter_team]
    if not others:
        return {}
    # Attack direction: toward the side where the opposing goalie stands.
    far = max(others, key=lambda p: abs(p["x"]))
    sign = 1 if far["x"] > 0 else -1
    goalie = far
    start = to_xy(row["EventStartCoordinate"])
    out = dict(attack_sign=sign, goalie=goalie["name"], goalie_xy=[goalie["x"], goalie["y"]])
    if start:
        out["shot_xy"] = list(start)
        out["distance_to_goal_line_m"] = round(math.hypot(sign * GOAL_LINE_X - start[0], start[1]), 1)
        defenders = [p for p in others if p is not goalie]
        near = min(defenders, key=lambda p: math.hypot(p["x"] - start[0], p["y"] - start[1]))
        out["nearest_defender"] = near["name"]
        out["nearest_defender_m"] = round(math.hypot(near["x"] - start[0], near["y"] - start[1]), 1)
    screening = [s for s in row["ShotScreeningPlayerIds"].split(",") if s]
    out["screening_ids"] = screening
    return out


def find(rows, m):
    hits = []
    for r in rows:
        if r["EventType"] != m["event"] or r["Period"] != str(m["period"]):
            continue
        clock = num(r["MatchClock"])
        if clock is None or abs(clock - m["clock"]) > TOLERANCE_S:
            continue
        text = " ".join([r["EventPrimaryPlayerName"], r["PenaltyReason"], r["StoppageOfPlayReason"]])
        if m["who"].lower() in text.lower():
            hits.append(r)
    return hits


# ---------- picking the moments ----------
# A shot rated 1 in 10 or better counts as a real chance (the demo's scale). Rules run in this order and
# skip shots already picked, so each card gets a different moment. PICK_RULES says what each rule looks for
# in words; the card shows that line to the visitor after the call.
REAL_CHANCE = 0.1
PENALTY_WINDOW_S = 120  # a minor penalty: the power play lasts up to two minutes
PICK_RULES = {
    "c4_lucky": "the goal with the smallest chance",
    "c1_good_spot": "the goal with the biggest chance",
    "c2_save": "the biggest chance the goalie saved",
    "c5_miss": "the biggest chance that missed the net",
    "c6_powerplay": "the goal that came quickest after a penalty",
    "c3_deserved": "the go-ahead goal that was the closest call",
    "p1_penalty": "the penalty before that goal",
}
# "Closest call" = rated nearest the 1-in-10 line (REAL_CHANCE), measured as a ratio (log scale), not a difference.


def _t(r):
    return (int(r["Period"]), num(r["MatchClock"]) or 0.0)


def pick(rows):
    """Return {card id: (event row, how many events its rule chose from)}, plus the penalty behind the power-play goal."""
    timed = [r for r in rows if num(r["MatchClock"]) is not None]  # an event without a clock can't be placed in the game
    shots = [r for r in timed if r["EventType"] == "Shot" and num(r["ShotXG"]) is not None]
    goals = [r for r in shots if r["ShotResult"] == "Goal"]
    penalties = [r for r in timed if r["EventType"] == "Penalty"]
    # Score before each goal, from every goal in the file (goals without an xG still count toward the score).
    score, ahead = {"Home": 0, "Away": 0}, set()
    for r in sorted((r for r in timed if r["EventType"] == "Shot" and r["ShotResult"] == "Goal"), key=_t):
        team = r["EventPrimaryTeam"]
        other = "Away" if team == "Home" else "Home"
        if score[team] == score[other]:
            ahead.add(id(r))  # this goal put the team ahead
        score[team] += 1

    def after_penalty(r):
        """Seconds since the latest penalty on the other team, if the goal came on the power play within the window."""
        if "Powerplay" not in r["TeamStrengthType"]:
            return None
        gaps = [_t(r)[1] - _t(p)[1] for p in penalties
                if p["Period"] == r["Period"] and p["EventPrimaryTeam"] != r["EventPrimaryTeam"] and 0 <= _t(r)[1] - _t(p)[1] <= PENALTY_WINDOW_S]
        return min(gaps) if gaps else None

    xg = lambda r: num(r["ShotXG"])
    rules = [
        ("c4_lucky", goals, lambda r: xg(r)),
        ("c1_good_spot", goals, lambda r: -xg(r)),
        ("c2_save", [r for r in shots if r["ShotResult"] == "Saved"], lambda r: -xg(r)),
        ("c5_miss", [r for r in shots if r["ShotResult"] == "Missed"], lambda r: -xg(r)),
        ("c6_powerplay", [r for r in goals if after_penalty(r) is not None], after_penalty),
        ("c3_deserved", [r for r in goals if id(r) in ahead], lambda r: abs(math.log(max(xg(r), 1e-6) / REAL_CHANCE))),
    ]
    picked, used = {}, set()
    for card, pool, key in rules:
        free = [r for r in pool if id(r) not in used]
        if not free:
            continue
        r = min(free, key=lambda r: (key(r), _t(r)))
        used.add(id(r))
        picked[card] = (r, len(pool))
    if "c6_powerplay" in picked:
        g = picked["c6_powerplay"][0]
        pen = max((p for p in penalties if p["Period"] == g["Period"] and p["EventPrimaryTeam"] != g["EventPrimaryTeam"]
                   and 0 <= _t(g)[1] - _t(p)[1] <= PENALTY_WINDOW_S), key=_t)
        picked["p1_penalty"] = (pen, 1)
    return picked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=os.environ.get("THINKSPORT_EVENTS_CSV"))
    ap.add_argument("--config", default=DEFAULT_CONFIG, help="moments config (default: scripts/moments_config.local.json, gitignored)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "moments.json"))
    args = ap.parse_args()
    if not args.csv or not os.path.isfile(args.csv):
        sys.exit("Give the event CSV with --csv or THINKSPORT_EVENTS_CSV (it must live outside this repo).")
    if not os.path.isfile(args.config):
        sys.exit(f"Missing {args.config}. Copy scripts/moments_config.example.json to scripts/moments_config.local.json and fill it in.")
    with open(args.config, encoding="utf-8") as f:
        config = json.load(f)
    MOMENTS = config["moments"]
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    result, problems = [], []
    picked = pick(rows)
    for m in MOMENTS:
        if m["id"] not in picked:
            sys.exit(f"{m['id']}: no moment in this match matches its rule ({PICK_RULES[m['id']]}); the demo needs all six cards.")
        r, among = picked[m["id"]]
        # Cross-check: the config names the moment we expect each rule to find.
        if r not in find(rows, m):
            problems.append(f"{m['id']}: the rule picked P{r['Period']} t={r['MatchClock']}, not the configured moment")
        players = snapshot(r)
        entry = dict(id=m["id"], period=m["period"], match_clock_s=num(r["MatchClock"]), timestamp_ms=num(r["Timestamp"]),
                     event=r["EventType"], strength=r["TeamStrengthType"],
                     primary_player=r["EventPrimaryPlayerName"], primary_team=r["EventPrimaryTeam"],
                     shot_result=r["ShotResult"], xg=num(r["ShotXG"]), shot_speed=num(r["ShotSpeed"]),
                     penalty_reason=r["PenaltyReason"], stoppage_reason=r["StoppageOfPlayReason"],
                     players=players, picked=PICK_RULES[m["id"]])
        print(f"  {m['id']}: picked as {PICK_RULES[m['id']]} (from {among})")
        if m["event"] == "Shot":
            entry["derived"] = derive(r, players)
        exp = m["expect"]
        d = entry.get("derived", {})
        if "xg" in exp and entry["xg"] != exp["xg"]:
            problems.append(f"{m['id']}: xG {entry['xg']} differs from shortlist {exp['xg']}")
        if "goalie" in exp and exp["goalie"] not in d.get("goalie", ""):
            problems.append(f"{m['id']}: goalie guess '{d.get('goalie')}' is not {exp['goalie']}")
        if "screening" in exp and len(d.get("screening_ids", [])) != exp["screening"]:
            problems.append(f"{m['id']}: screening count {len(d.get('screening_ids', []))} differs from {exp['screening']}")
        if "reason" in exp and exp["reason"].lower() not in entry["penalty_reason"].lower():
            problems.append(f"{m['id']}: penalty reason '{entry['penalty_reason']}' is not {exp['reason']}")
        result.append(entry)

    # Match header for the mock site: every goal in order, so the page can show the score and each card its score at the time.
    goals = [dict(period=int(r["Period"]), clock_s=num(r["MatchClock"]), team=r["EventPrimaryTeam"],
                  player=r["EventPrimaryPlayerName"], strength=r["TeamStrengthType"])
             for r in rows if r["EventType"] == "Shot" and r["ShotResult"] == "Goal"]
    goals.sort(key=lambda g: (g["period"], g["clock_s"]))
    penalties = [dict(period=int(r["Period"]), clock_s=num(r["MatchClock"]), team=r["EventPrimaryTeam"],
                      player=r["EventPrimaryPlayerName"], reason=r["PenaltyReason"])
                 for r in rows if r["EventType"] == "Penalty"]
    penalties.sort(key=lambda g: (g["period"], g["clock_s"]))
    match = dict(goals=goals, penalties=penalties, final=dict(Home=sum(g["team"] == "Home" for g in goals),
                                         Away=sum(g["team"] == "Away" for g in goals)))
    if config.get("team_names"):
        match["team_names"] = config["team_names"]

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dict(goal_line_x_assumed=GOAL_LINE_X, match=match, moments=result), f, indent=1)
    print(f"wrote {len(result)} moments to {out}; final score {match['final']['Home']}-{match['final']['Away']} (home-away)")
    for e in result:
        d = e.get("derived", {})
        print(f"  {e['id']}: {e['event']} P{e['period']} t={e['match_clock_s']:.0f}s xG={e['xg']} "
              f"dist={d.get('distance_to_goal_line_m')} nearest={d.get('nearest_defender_m')} players={len(e['players'])}")
    print("checks against shortlist:", "all pass" if not problems else "")
    for p in problems:
        print("  DIFF", p)


if __name__ == "__main__":
    main()

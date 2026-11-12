#!/usr/bin/env python3
"""Write demo/synthetic/moments.json: a fully invented match for the public demo.

Nothing here comes from the WiseHockey data. Teams, players, positions, clocks, xG and speeds are all
made up; only the file structure and each card's lesson mirror the real thing. `derived` is computed
from the invented players with the same `derive()` that extract_moments.py uses.

    python3 scripts/make_synthetic_moments.py

Positions are written in the shooting team's attack frame (u along the attack, v across) and turned into rink
coordinates: Home attacks toward +x, Away toward -x. Standard library only.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_moments import GOAL_LINE_X, PICK_RULES, derive  # noqa: E402

rng = random.Random(2026)

TEAMS = {"Home": {"name": "Lakeview Lynx", "short": "LYN"}, "Away": {"name": "Glacier Rams", "short": "GLR"}}

# name -> id. Invented.
ROSTER = {
    "Home": {"G": ("#31 Jonas Marquard", "910031"), "Solberg": ("#8 Henrik Solberg", "910008"),
             "Reinholt": ("#12 Tobias Reinholt", "910012"), "Brenner": ("#17 Oskar Brenner", "910017"),
             "Vandrell": ("#21 Dario Vandrell", "910021"), "Lindqvist": ("#23 Viktor Lindqvist", "910023"),
             "Haldane": ("#27 Emil Haldane", "910027")},
    "Away": {"G": ("#1 Anders Pellman", "920001"), "Teague": ("#5 Cormac Teague", "920005"),
             "Ostrow": ("#9 Lars Ostrow", "920009"), "Brandvold": ("#14 Mikael Brandvold", "920014"),
             "Rask": ("#19 Stefan Rask", "920019"), "Varga": ("#22 Nikolai Varga", "920022"),
             "Hartwell": ("#26 Joakim Hartwell", "920026")},
}
SIGN = {"Home": 1, "Away": -1}


def nm(team, key):
    return ROSTER[team][key][0]


def players(spec, attacker):
    """spec: {team: {key: (u, v)}}, all in the shooting team's attack frame (u toward the goal it attacks)."""
    out = []
    s = SIGN[attacker]
    for team, items in spec.items():
        for key, (u, v) in items.items():
            name, pid = ROSTER[team][key]
            out.append(dict(id=pid, name=name, team=team, x=round(s * u, 1), y=round(s * v, 1),
                            velocity=round(rng.uniform(0.4, 8.6), 1), direction=round(rng.uniform(0, 359), 1)))
    return out


def shot(mid, period, clock, strength, team, key, result, xg, spec, screening=()):
    pl = players(spec, team)
    shooter = next(p for p in pl if p["name"] == nm(team, key))
    row = {"EventPrimaryTeam": team, "EventStartCoordinate": f"{shooter['x']},{shooter['y']}",
           "ShotScreeningPlayerIds": ",".join(ROSTER[t][k][1] for t, k in screening)}
    return dict(id=mid, period=period, match_clock_s=float(clock),
                timestamp_ms=1798000000000.0 + period * 1.5e6 + clock * 1000.0,
                event="Shot", strength=strength, primary_player=shooter["name"], primary_team=team,
                shot_result=result, xg=xg, shot_speed=round(rng.uniform(78, 118), 1),
                penalty_reason="", stoppage_reason="", players=pl, derived=derive(row, pl))


moments = [
    # Real chance, goal: close, open, nobody screening.
    shot("c1_good_spot", 2, 742, "FullStrength", "Away", "Brandvold", "Goal", 0.22, {
        "Away": {"Brandvold": (21.0, 1.8), "Rask": (19.4, -7.1), "Varga": (15.2, 6.4), "Hartwell": (6.1, 2.2),
                 "Teague": (11.8, -9.4), "G": (-24.8, -0.4)},
        "Home": {"G": (25.2, 0.5), "Reinholt": (17.6, 4.4), "Solberg": (22.8, -7.0), "Vandrell": (14.0, -2.1),
                 "Lindqvist": (12.0, 6.4), "Haldane": (8.0, -4.0)}}),
    # Real chance, saved: close but crowded.
    shot("c2_save", 3, 355, "FullStrength", "Home", "Reinholt", "Saved", 0.26, {
        "Home": {"Reinholt": (21.7, -1.5), "Solberg": (21.5, 6.9), "Vandrell": (18.3, -5.4), "Lindqvist": (12.7, 1.0),
                 "Haldane": (9.9, 7.1), "G": (-23.6, 1.9)},
        "Away": {"G": (24.6, 1.2), "Ostrow": (23.6, 0.3), "Teague": (20.0, -6.2), "Brandvold": (17.0, 4.4),
                 "Rask": (14.0, -3.5), "Varga": (12.0, 6.5)}}),
    # Real chance (above the line), goal: straight on, goalie lined up, nobody within 2.5 m.
    shot("c3_deserved", 3, 1013, "FullStrength", "Home", "Vandrell", "Goal", 0.19, {
        "Home": {"Vandrell": (17.2, -0.5), "Reinholt": (12.9, 3.8), "Solberg": (11.5, -6.2), "Lindqvist": (6.0, 0.9),
                 "Haldane": (4.2, -7.4), "G": (-23.9, -1.8)},
        "Away": {"G": (23.8, 1.0), "Ostrow": (19.6, 3.0), "Teague": (21.5, -5.9), "Brandvold": (14.0, 6.6),
                 "Rask": (12.0, -7.4), "Varga": (23.0, 5.6)}}),
    # Long shot, goal: far out, tightly marked, two bodies (one from each team) in front of the goalie.
    shot("c4_lucky", 1, 872, "FullStrength", "Away", "Rask", "Goal", 0.027, {
        "Away": {"Rask": (5.8, 3.5), "Varga": (21.9, 2.6), "Hartwell": (14.2, -3.0), "Ostrow": (2.4, -1.0),
                 "Teague": (10.5, 9.5), "G": (-23.9, -1.9)},
        "Home": {"G": (25.6, 0.6), "Solberg": (21.0, -3.1), "Reinholt": (6.2, 4.0), "Vandrell": (11.5, 7.4),
                 "Lindqvist": (14.9, -6.6), "Haldane": (3.6, -4.4)}},
         screening=[("Home", "Solberg"), ("Away", "Varga")]),
    # Real chance, miss: lots of room.
    shot("c5_miss", 3, 141, "FullStrength", "Away", "Hartwell", "Missed", 0.16, {
        "Away": {"Hartwell": (21.2, -1.6), "Brandvold": (22.9, 6.4), "Rask": (14.4, 3.2), "Teague": (9.5, -6.6),
                 "Varga": (6.2, 1.1), "G": (-24.1, -1.8)},
        "Home": {"G": (25.4, 0.4), "Lindqvist": (16.6, 1.3), "Solberg": (22.5, 5.9), "Reinholt": (13.0, -7.1),
                 "Vandrell": (11.0, 2.0), "Haldane": (17.9, -8.0)}}),
    # Long shot, goal: on a power play, defending team a skater short.
    shot("c6_powerplay", 2, 491, "HomePowerplay", "Home", "Solberg", "Goal", 0.038, {
        "Home": {"Solberg": (17.6, -3.0), "Reinholt": (22.0, -7.5), "Vandrell": (18.6, 6.3), "Lindqvist": (9.9, 9.0),
                 "Haldane": (11.0, -9.4), "G": (-24.0, -2.0)},
        "Away": {"G": (25.1, -0.7), "Teague": (19.2, -0.5), "Brandvold": (21.8, 6.0), "Varga": (15.0, -9.5),
                 "Hartwell": (12.5, 4.8)}}),
]

def set_up(m, key, kind, seconds, start=None, end=None):
    """Invented assist in the same shape extract_moments.assist() writes; start/end in the shooting team's attack frame."""
    team = m["primary_team"]
    sg = SIGN[team]
    xy = lambda uv: [round(sg * uv[0], 1), round(sg * uv[1], 1)] if uv else None
    m["assist"] = dict(id=ROSTER[team][key][1], kind=kind, seconds_before=seconds, start=xy(start), end=xy(end),
                       metres=round(math.hypot(end[0] - start[0], end[1] - start[1]), 1) if start and end else None)


byid = {m["id"]: m for m in moments}
set_up(byid["c1_good_spot"], "Rask", "pass", 1, (19.0, -7.0), (20.6, 1.6))
set_up(byid["c3_deserved"], "Reinholt", "carry", 4, (2.0, 3.0), (13.0, 3.6))
set_up(byid["c4_lucky"], "Teague", "pass", 2, (10.2, 9.2), (6.2, 3.9))
set_up(byid["c6_powerplay"], "Reinholt", "faceoff", 3)

penalty = dict(id="p1_penalty", period=2, match_clock_s=455.0, timestamp_ms=1798000000000.0 + 2 * 1.5e6 + 455000.0,
               event="Penalty", strength="", primary_player=nm("Away", "Ostrow"), primary_team="Away", shot_result="",
               xg=None, shot_speed=None, penalty_reason="Hooking", stoppage_reason="")
moments.append(penalty)
for m in moments:
    m["picked"] = PICK_RULES[m["id"]]  # same rule line as the real cards; the invented match is built to fit it

goals = [
    (1, 872, "Away", nm("Away", "Rask"), "FullStrength"),
    (1, 1090, "Home", nm("Home", "Brenner"), "FullStrength"),
    (2, 491, "Home", nm("Home", "Solberg"), "HomePowerplay"),
    (2, 742, "Away", nm("Away", "Brandvold"), "FullStrength"),
    (3, 1013, "Home", nm("Home", "Vandrell"), "FullStrength"),
    (3, 1137, "Home", nm("Home", "Lindqvist"), "FullStrength"),
]
penalties = [
    (1, 1004, "Home", nm("Home", "Haldane"), "Tripping"),
    (2, 455, "Away", nm("Away", "Ostrow"), "Hooking"),
    (3, 701, "Away", nm("Away", "Teague"), "Interference"),
]
match = dict(
    goals=[dict(period=p, clock_s=float(c), team=t, player=pl, strength=s) for p, c, t, pl, s in goals],
    penalties=[dict(period=p, clock_s=float(c), team=t, player=pl, reason=r) for p, c, t, pl, r in penalties],
    final=dict(Home=sum(g[2] == "Home" for g in goals), Away=sum(g[2] == "Away" for g in goals)),
    team_names=TEAMS)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "demo", "synthetic", "moments.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(dict(synthetic=True, goal_line_x_assumed=GOAL_LINE_X, match=match, moments=moments), f, indent=1)
print(f"wrote {os.path.abspath(out)}; final {match['final']['Home']}-{match['final']['Away']}")
for m in moments:
    d = m.get("derived", {})
    print(f"  {m['id']}: P{m['period']} t={m['match_clock_s']:.0f} xG={m['xg']} dist={d.get('distance_to_goal_line_m')} "
          f"near={d.get('nearest_defender_m')} screen={len(d.get('screening_ids', []))} players={len(m.get('players', []))}")

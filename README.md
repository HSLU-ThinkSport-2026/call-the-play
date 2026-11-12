# Call the play

A prototype for the [SIC Data Hack Challenge 2026](https://innovation-thinksport.agorize.com/en/challenges/sic-datahack-challenge-2026) (ThinkSport × Spengler Cup). Team Hochschule Luzern: Aline Aronsky and Niklas Hermann, HSLU MSc Applied Information and Data Science.

**Try it:** https://hslu-thinksport-2026.github.io/call-the-play/demo/

## The idea

Most visitors open the match page, check the score and leave. "Call the play" puts one question about a real moment of the match right under the score: *Goal deserved or lucky? Was that a real chance?* One tap, then the answer as a plain number ("1 in 5 shots like this go in"), then, if you want, the reasons one at a time on a 2D rink: how far out, who was close, who blocked the goalie's view and, on goals, who set it up. After six moments you see where each shot came from and how many of your calls matched the data.

Every card uses one scale from the tracking data's shot rating (expected goals): a shot rated 1 in 10 or better is a real chance, anything below is a long shot.

## What works and what is in development

- **Works:** the six cards end to end on a mock-up of the tournament match page (ticker, "Call the play" buttons, question, answer, rink reveal, end screen with a shot map per moment and a share button), on phone and desktop, keyboard use and screen-reader labels. The six moments are picked automatically by rules over every shot of the match (`scripts/extract_moments.py`).
- **In development:** a daily streak, crowd results, live data during the match, other languages.

## Data

This public copy runs on a **fictional match with synthetic data** (`demo/synthetic/moments.json`, made by `scripts/make_synthetic_moments.py`) in the same structure as the real export. The real WiseHockey tracking data and match video are confidential to the challenge and are not in this repository. Logos, sponsors and crests on the page are placeholders; the page is a concept mock-up, not the official site.

With access to the real data, `scripts/extract_moments.py` turns the event CSV into `data/moments.json`, and `scripts/cut_clips.py` cuts a short clip per moment from the match video. Both outputs stay local. The moment picks and video alignment live in a local config (`scripts/moments_config.example.json` shows the shape).

## Run it locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/demo/?data=synthetic
```

No build step and no dependencies: plain HTML, CSS and JavaScript.

## Files

- `demo/`: the prototype (`app.js` cards and rink, `site.css` match-page mock-up, `style.css` card styles)
- `scripts/`: data extraction, synthetic match, clip cutting
- `PRODUCT.md`: audience and product principles
- `DESIGN.md`: design contract (colours, type, layout rules)

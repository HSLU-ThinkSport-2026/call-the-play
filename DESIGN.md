# Design system: "Call the play" demo

Operational prototype, not a showcase. Goal: a casual phone visitor understands each card in seconds. "Understandable over good-looking" (Webinar 1). Direction: ice-white rink on a navy page, one cyan accent, nothing decorative.

## 1. Principles
- One question per screen, one cue per tap; the number comes right after the tap.
- Phone first: 375 px wide is the design width; the page is a single column, max 440 px.
- The rink shows only what the sentence needs. Other skaters stay faint.
- Anything that is not real data is labelled as a mock-up.

## 2. Tokens (CSS custom properties in `demo/style.css`)
| Token | Value | Use |
|---|---|---|
| `--page` | `#07234A` | card background (Spengler Cup site navy) |
| `--page-2` | `#0E3164` | raised panels |
| `--ink` | `#F4F8FB` | text on navy |
| `--ink-dim` | `#B4C6DA` | secondary text |
| `--ice` | `#EAF6FA` | rink surface |
| `--rink-line` | `#B7D3DE` | boards, lines on the rink |
| `--blue-line` | `#3A6FD8` | blue line |
| `--red-line` | `#D64545` | centre and goal lines |
| `--home` | `#07234A` | Home skaters |
| `--away` | `#F2C200` (edge `#8A6A00`) | Away skaters: away-team yellow |
| `--accent` | `#4BB2CF` | key figures, focus ring, primary button (Spengler Cup site teal) |
| `--accent-ink` | `#07234A` | text on accent |
| `--accent-hover` | `#6CC4DB` | primary and Start button hover |
| `--ink-light` | `#07234A` | text and marks on light surfaces (rink labels, key, scale bar, end-screen marks) |
| `--puck` | `#111` | puck |
| `--yes` / `--no` | `#7FE0A8` / `#FFB4A8` | right/wrong line and end-screen marks |

`site.css` (the mock host page) aliases these: `--navy` = `--page`, `--teal` = `--accent`. Focus ring is teal on navy; the ticker's "Call the play" buttons on the white page use a navy ring (teal is 2.5:1 on white).

Contrast: `--ink` on `--page` stays high (light on navy); `--accent-ink` on `--accent` (navy on teal) about 6:1. The yellow `--away` fill is low-contrast on `--ice`, so away dots carry the darker `--away-edge` outline, and the team is also named in the key and labels.

## 3. Type
Montserrat (free Google Font, as on the Spengler Cup site). Card title and promo title uppercase 800 with .04em tracking; questions, headlines and reason titles 800. Buttons are pills (radius 999), like the site's. Sizes: question 24/28 bold, body 17/24, caption 13/18, big number 40/44 bold. Numbers use `font-variant-numeric: tabular-nums`.

## 4. Spacing and shape
4 px base: 4, 8, 12, 16, 24, 32. Radius 8 (panels, rink), 10 (the pop-up card), 999 (all buttons, as pills), matching the site. Tap targets 52 px high minimum. 16 px side gutters.

## 5. Primitives and states
| Primitive | States |
|---|---|
| Answer button (two per card) | default, hover, active (pressed), focus-visible (3 px accent ring), chosen, disabled after choosing |
| Primary button ("Show me why", "Next") | default, hover, active, focus-visible |
| Rink (SVG) | frozen frame; cue 1 (shooter, goalie, goal); cue 2 (nearest defender with distance); cue 3 (screening players, where the data lists any) |
| Chance bar | filled to the xG share, labelled in plain words ("1 in 5") |
| Error panel | shown if `data/moments.json` cannot be loaded, with the command that creates it |
| Text-only card | for calls with no player snapshot in the data (penalty, offside): an icon instead of the rink, the call as a big headline after the tap |

## 6. Motion
No UI animation; state changes are instant. The match clips autoplay to the pause point and replay after the answer. With `prefers-reduced-motion: reduce` a card opens on the paused frame and the answer skips the replay (`reduceMotion` in `demo/app.js`).

## 7. Accessibility
Real `<button>` elements; the reveal text sits in an `aria-live="polite"` region; the rink SVG has a `role="img"` and a text description generated from the same data; colour is never the only carrier (team is also stated in the legend and in labels).

## 8. Accepted debt
- Rink markings are approximate; the goal line is assumed at 26.5 m (see `scripts/extract_moments.py`).
- Frozen frames only: the data has positions at events, not between them.
- The rink is capped at 38% of the screen height (`style.css`) so the buttons never fall below the fold. Long shots (cards 4, 6) are drawn smaller, with dots and labels scaled up partway; on short phones the goal area is tight. Portrait only: the rink is not redrawn on rotation, and the text-only icons get no size correction in landscape.
- A defender closer to the shooter than the dot sizes allow is drawn just outside the shooter's ring. The label keeps the measured distance.

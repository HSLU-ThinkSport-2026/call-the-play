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
| `--ink-light` | `#07234A` | text and marks on light surfaces (rink labels, key, verdict label, shot maps) |
| `--puck` | `#111` | puck |
| `--yes` / `--no` | `#7FE0A8` / `#FFB4A8` | right/wrong line and end-screen marks |

`site.css` (the mock host page) aliases these: `--navy` = `--page`, `--teal` = `--accent`. Focus ring is teal on navy; the ticker's "Call the play" buttons on the white page use a navy ring (teal is 2.5:1 on white).

Contrast: `--ink` on `--page` stays high (light on navy); `--accent-ink` on `--accent` (navy on teal) about 6:1. The yellow `--away` fill is low-contrast on `--ice`, so away dots carry the darker `--away-edge` outline, and the team is also named in the key and labels.

## 3. Type
Montserrat (free Google Font, as on the Spengler Cup site), used plainly: the window title is sentence case 700, questions and section titles 800. The reveal figure ("3 in 10") is the one display size: 800, tight tracking (-.035em), `clamp(56px, 15vw, 88px)`; over a clip on a short desktop window it scales with the height (`clamp(40px, 10vh, 88px)`). Other sizes: question 24/28, body 16/24, caption 13/18. Numbers use `font-variant-numeric: tabular-nums`.

## 4. Spacing and shape
4 px base: 4, 8, 12, 16, 24, 32. Radius 8 for buttons, the rink and the pop-up; 4 for chips (score chip, verdict label). No box inside the window: text sits straight on the navy. Tap targets 44 px minimum (answer buttons 52). 16 px side gutters.

## 5. Primitives and states
| Primitive | States |
|---|---|
| Title bar | flat navy, hairline under it, sticky; title left, progress ticks (one per moment: done, current wider in teal, to come), plain × close button |
| Match strip | period and clock, then the score as a chip |
| Answer button (two per card) | default, hover, active (pressed), focus-visible (3 px accent ring) |
| Primary button ("Show me why", "Next reason") | default, hover, active, focus-visible; full width and pinned to the bottom on phones |
| Reveal | "You said X", the figure ("3 in 10"), "shots like this go in. This one did.", the data's answer as a white label ("Real chance", "Easy to stop") and "Your call too" / "Not your call" |
| Chance axis | a line from 0 to 5 in 10 with a tick per 1 in 10; grey under 1 in 10 (long shot), teal above (real chance); the shot as a white dot |
| Rink (SVG) | shooter ringed; the reason's players drawn full, others at 70 %; shot line, nearest defender with distance, screening players, and for goals the set-up player with a pass or carry arrow; key in one line (both teams, shooter) |
| "Picked automatically" line | under the button on the answer screen: which rule chose this moment |
| End screen | a sentence built from the data as the title ("Two of these were long shots, and both still went in."), how many calls matched, then one small shot map per moment (zone, net, where the shot came from) with its rating, the data's answer and the visitor's call; Share and "Back to the match". Six in a row on desktop, two columns on phones |
| Error panel | shown if `data/moments.json` cannot be loaded, with the command that creates it |

## 6. Motion
One moment: on the answer screen the figure and then the verdict label rise in (opacity and 8 px, exponential ease-out). Everything else is instant. The match clips autoplay to the pause point and replay after the answer. With `prefers-reduced-motion: reduce` there is no rise, a card opens on the paused frame and the answer skips the replay (`reduceMotion` in `demo/app.js`).

## 7. Accessibility
Real `<button>` elements; the reveal text sits in an `aria-live="polite"` region; the rink SVG has a `role="img"` and a text description generated from the same data; colour is never the only carrier (team is also stated in the legend and in labels).

## 8. Accepted debt
- Rink markings are approximate; the goal line is assumed at 26.5 m (see `scripts/extract_moments.py`).
- Frozen frames only: the data has positions at events, not between them.
- The rink is capped at 38% of the screen height (`style.css`) so the buttons never fall below the fold. Long shots (cards 4, 6) are drawn smaller, with dots and labels scaled up partway; on short phones the goal area is tight. Portrait only: the rink is not redrawn on rotation, and the text-only icons get no size correction in landscape.
- A defender closer to the shooter than the dot sizes allow is drawn just outside the shooter's ring. The label keeps the measured distance.

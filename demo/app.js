// "Call the play" demo inside a mock tournament match page.
// Reads data/moments.json (or the synthetic match in demo/synthetic/ for the public build) and data/clips/*.mp4 (made by scripts/extract_moments.py and scripts/cut_clips.py, both gitignored).
// Run from the repo root:  python3 -m http.server 8000   then open http://localhost:8000/demo/

const DATA_URL = "../data/moments.json";
const SYNTHETIC_URL = "./synthetic/moments.json"; // invented match for the public build (no confidential data); also used when the real file is missing
const REAL_CHANCE = 0.10; // one scale for every card: rated 1 in 10 or better = a real chance, worse = a long shot
const NEAR_M = 2.5; // defenders within this distance of the shot count as "on him" in cue 2

const app = document.getElementById("app");
const progress = document.getElementById("progress");
let data = null;
let state = { card: 0, stage: "ask", answer: null, cue: 0 };
let askShownAt = 0; // a second click on "Skip" must not land on the answer that appears under it
let results = []; // one { card, answer, right } per call, for the end screen
const CLIP_URL = (id) => `../data/clips/${id}.mp4`;
const PAUSE_AT_S = 7.5; // clips start 8 s before the shot; pause just before it for the question

// ---------- small helpers ----------
const byId = (id) => data.moments.find((m) => m.id === id);
const number = (name) => (name.startsWith("#") ? name.split(" ")[0] : "");
const last = (name) => name.split(" ").slice(-1)[0];
const teamName = (side) => data?.match?.team_names?.[side]?.name ?? side;
const label = (name) => `${number(name)} ${last(name)}`.trim();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const word = (n) => ["zero", "one", "two", "three", "four", "five", "six"][n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const short = (side) => data?.match?.team_names?.[side]?.short ?? (side === "Home" ? "HOM" : "AWY");
const PERIOD = ["", "1st period", "2nd period", "3rd period"];
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
// Score just before a moment (goals strictly earlier in the game).
function scoreBefore(period, sec) {
  const s = { Home: 0, Away: 0 };
  data.match.goals.forEach((g) => { if (g.period < period || (g.period === period && g.clock_s < sec)) s[g.team] += 1; });
  return s;
}

function chance(xg) {
  if (xg >= 0.25) return `${Math.round(xg * 10)} in 10`;
  const n = 1 / xg;
  return `1 in ${n < 20 ? Math.round(n) : Math.round(n / 10) * 10}`;
}

function chanceSentence(xg) {
  if (xg >= 0.25) return `about ${Math.round(xg * 10)} times in 10`;
  const n = 1 / xg;
  return `about 1 time in ${n < 20 ? Math.round(n) : Math.round(n / 10) * 10}`;
}

// Where this shot sits on the one scale. Linear 0 to 5 in 10; the 1-in-10 line is at 20 %.
function scaleBar(xg) {
  const pos = Math.min(xg, 0.5) / 0.5 * 100;
  return `<div class="scale" role="img" aria-label="Rated ${chanceSentence(xg).replace("about ", "")}. Under 1 in 10 is a long shot; 1 in 10 or better is a real chance.">
    <div class="scale-track"><span class="seg long">Long shot</span><span class="seg real">Real chance</span><i class="pin" style="left:${pos}%"></i></div>
    <p class="scale-cap">Rated 1 in 10 or better = a real chance</p></div>`;
}

function outcome(m) {
  const r = (m.shot_result || "").toLowerCase();
  if (r === "goal") return "This one did.";
  if (r === "saved") return "This one was saved.";
  return `This one was ${r}.`;
}

function roles(m) {
  const d = m.derived;
  const shooter = m.players.find((p) => p.name === m.primary_player) || null;
  const goalie = m.players.find((p) => p.name === d.goalie) || null;
  const defenders = m.players.filter((p) => p.team !== m.primary_team && p !== goalie);
  const shot = { x: d.shot_xy[0], y: d.shot_xy[1] };
  const near = defenders
    .map((p) => ({ p, m: dist(p, shot) }))
    .sort((a, b) => a.m - b.m);
  const screening = m.players.filter((p) => d.screening_ids.includes(p.id));
  return { shooter, goalie, defenders, shot, near, screening };
}

// The correct answer comes from the one scale, not from a per-card number: real chance if xG >= REAL_CHANCE.
const rightOf = (card) => (byId(card.id).xg >= REAL_CHANCE ? card.real : 1 - card.real);

// The verdict's "{rated}" is filled from the moment's own xG, so every data set states its own number.
const verdictOf = (card) => card.verdict.replace("{rated}", chance(byId(card.id).xg));

// ---------- the six cards ----------
// Declared in teaching order; sorted by match time once the data loads (see start()).
const CARDS = [
  {
    id: "c1_good_spot",
    why: "What makes it a good spot",
    pauseAt: 6.8, // pause while the shooter is driving at the net, before the attempt
    question: "Is this a good spot to score from?",
    options: ["Good spot", "Bad spot"],
    cues: (m) => {
      const r = roles(m);
      return [
        { text: `${label(m.primary_player)} shoots from about ${Math.round(m.derived.distance_to_goal_line_m)} m, right in front of the net.`, show: { shotLine: true } },
        { text: `The nearest defender is ${r.near[0].m.toFixed(1)} m away.${m.derived.screening_ids.length === 0 ? " Nobody is blocking the goalie's view." : ""}`, show: { shotLine: true, near: 1 } },
      ];
    },
    real: 0, // option that means "a real chance"
    verdict: "Good spot. Rated about {rated}, well above the 1 in 10 that counts as a real chance.",
  },
  {
    id: "c2_save",
    why: "How good a chance it was",
    question: "Was that a real chance?",
    options: ["Real chance", "Long shot"],
    cues: (m) => {
      const r = roles(m);
      const gap = r.near[0].m;
      return [
        { text: `${label(m.primary_player)} is about ${m.derived.distance_to_goal_line_m} m from the goal line. That is very close.`, show: { shotLine: true } },
        { text: `A defender is ${gap < 0.75 ? "half a metre" : gap.toFixed(1) + " m"} away.`, show: { shotLine: true, near: 1 } },
      ];
    },
    real: 0,
    verdict: "Real chance. Rated about {rated}, so the goalie earned this save.",
  },
  {
    id: "c3_deserved",
    why: "Deserved or lucky?",
    pauseAt: 10, // "deserved or lucky" is about a goal, so it pauses once the puck is in
    question: "Goal deserved or lucky?",
    options: ["Deserved", "Lucky"],
    cues: (m) => {
      const r = roles(m);
      const straight = Math.abs(r.shot.y) < 2;
      const lined = r.goalie && Math.abs(r.goalie.y - r.shot.y) < 1.5;
      const close = r.near.filter((n) => n.m <= NEAR_M).length;
      return [
        { text: `${label(m.primary_player)} shoots from about ${Math.round(m.derived.distance_to_goal_line_m)} m${straight ? ", straight in front" : ""}.${lined ? " The goalie is lined up with the shot." : ""}`, show: { shotLine: true } },
        { text: `${cap(word(close))} ${close === 1 ? "defender is" : "defenders are"} within ${NEAR_M} m of the shot.${m.derived.screening_ids.length === 0 ? " Nobody is blocking the goalie's view." : ""}`, show: { shotLine: true, near: NEAR_M } },
      ];
    },
    real: 0, // "Deserved" = it was a real chance
    verdict: "Deserved. Rated about {rated}, a real chance and not a fluke.",
  },
  {
    id: "c4_lucky",
    why: "Deserved or lucky?",
    pauseAt: 10, // "deserved or lucky" is about a goal, so it pauses once the puck is in
    question: "Goal deserved or lucky?",
    options: ["Deserved", "Lucky"],
    cues: (m) => {
      const r = roles(m);
      const teams = new Set(r.screening.map((p) => p.team));
      return [
        { text: `${label(m.primary_player)} shoots from about ${Math.round(m.derived.distance_to_goal_line_m)} m out, a long way for a goal.`, show: { shotLine: true } },
        { text: `A defender is ${r.near[0].m.toFixed(1)} m away, so it isn't an open shot.`, show: { shotLine: true, near: 1 } },
        { text: `${cap(word(r.screening.length))} players stand in front of the goalie${teams.size === 2 ? ", one from each team" : ""}. The goalie can't see the shot.`, show: { shotLine: true, screening: true } },
      ];
    },
    real: 0,
    verdict: "Lucky. Rated about {rated}, a long shot: it went in because the goalie couldn't see it.",
  },
  {
    id: "c5_miss",
    why: "How good a chance it was",
    pauseAt: 9, // a question about the miss, so it pauses just after the shot
    question: "Was that a real chance?",
    options: ["Long shot", "Real chance"],
    cues: (m) => {
      const r = roles(m);
      return [
        { text: `${label(m.primary_player)} shoots from about ${Math.round(m.derived.distance_to_goal_line_m)} m.`, show: { shotLine: true } },
        { text: `The nearest defender is ${r.near[0].m.toFixed(1)} m away, so he has room.`, show: { shotLine: true, near: 1 } },
      ];
    },
    real: 1,
    verdict: "Real chance. Rated about {rated}, but even real chances usually don't go in. A miss here is normal.",
  },
  {
    id: "c6_powerplay",
    why: "How hard it was to stop",
    pauseAt: 9.5, // "how easy was that to stop?" is about the goal, so it pauses once the puck is in
    question: "How easy was that to stop?",
    options: ["Hard", "Easy"], // "Easy to stop" = it was a long shot
    cues: (m) => {
      const r = roles(m);
      const pen = byId("p1_penalty");
      const gap = Math.round(m.match_clock_s - pen.match_clock_s);
      const skaters = r.defenders.length;
      const defTeam = m.primary_team === "Home" ? "Away" : "Home";
      return [
        { text: `${cap(word(gap))} seconds after a ${pen.penalty_reason.toLowerCase()} penalty on ${label(pen.primary_player)}, ${label(m.primary_player)} shoots from about ${Math.round(m.derived.distance_to_goal_line_m)} m. ${teamName(defTeam)} has ${word(skaters)} skaters on the ice.`, show: { shotLine: true } },
        { text: `The nearest defender is ${r.near[0].m.toFixed(1)} m away.`, show: { shotLine: true, near: 1 } },
      ];
    },
    real: 0, // "Hard to stop" = it was a real chance
    verdict: "Easy to stop. Rated about {rated}, a long shot: most shots like this are saved. A team a skater down leaves gaps, and this one got through.",
  },
];

// ---------- the rink (SVG, goal at the top) ----------
function rinkSvg(m, show = {}, fit = [show]) {
  const d = m.derived;
  const s = d.attack_sign;
  const P = (x, y) => [s * y, -s * x]; // attack direction up, screen y grows downward
  const r = roles(m);
  const [shx, shy] = P(r.shot.x, r.shot.y);
  const goalY = -data.goal_line_x_assumed;
  const parts = [];

  // Zoom onto the action (goal, shooter, highlighted players) instead of the whole zone.
  // z scales dots and labels so a tight crop stays readable without growing as fast as the zoom.
  const focusPts = [[0, goalY - 2.2], [shx, shy]];
  // Fit to every clue of the card, not just the current one, so the rink keeps its size and the text below does not jump.
  fit.forEach((f) => {
    if (f.near) r.near.filter((n, i) => (f.near === 1 ? i < 1 : n.m <= f.near)).forEach((n) => focusPts.push(P(n.p.x, n.p.y)));
    if (f.screening) r.screening.forEach((p) => focusPts.push(P(p.x, p.y)));
  });
  const fx = focusPts.map((q) => q[0]);
  const fy = focusPts.map((q) => q[1]);
  let vx0 = Math.min(...fx) - 4.5;
  let vx1 = Math.max(...fx) + 4.5;
  if (vx1 - vx0 < 12) { const c = (vx0 + vx1) / 2; vx0 = c - 6; vx1 = c + 6; }
  if (vx0 < -14) { vx1 += -14 - vx0; vx0 = -14; }
  if (vx1 > 14) { vx0 -= vx1 - 14; vx1 = 14; }
  const vy0 = goalY - 3.2;
  let vy1 = Math.max(Math.min(Math.max(...fy) + 5, -3.5), vy0 + 11);
  // style.css caps the rink at 35% of the screen height (inside the card), so a tall view is drawn narrower than the card.
  // k is how much it shrank. Dots and labels grow by sqrt(k): readable again, without crowding the goal area.
  // In the wide desktop window the rink sits in the left column of the two-column layout (site.css: 58% of the row, 24px gap).
  const widget = document.getElementById("widget");
  const wideWhy = widget && widget.classList.contains("wide") && matchMedia("(min-width: 761px)").matches;
  const cardW = wideWhy ? (widget.clientWidth - 32 - 24) * 0.58 : app.clientWidth || 358;
  const maxH = rinkMaxHeight();
  const shrink = () => (maxH > 0 ? cardW / Math.min(cardW, (maxH * (vx1 - vx0)) / (vy1 - vy0)) : 1);
  let k = shrink();
  vy1 = Math.max(vy1, shy + 4.6 * Math.sqrt((vx1 - vx0) / 28) * 0.8 * Math.sqrt(k)); // room for the shooter's name under the dot
  k = shrink(); // the view may have grown taller, so measure the shrink again
  const z = Math.sqrt((vx1 - vx0) / 28) * 0.8 * Math.sqrt(k);
  // Labels are 1.25 units * --u, which on screen comes to about 1.25 * cardW / (28 * sqrt(k)) px.
  // That suits a phone (~16 px) but grows to ~28 px in the wide desktop window, louder than the text beside it,
  // so cap the on-screen label size at 16 px.
  const labelPx = (1.25 * cardW) / (28 * Math.sqrt(k));
  // Floor at 11.5 px so a height cap (short phones) can't shrink labels below readable; ceiling 16 px.
  const u = ((vx1 - vx0) / 28) * Math.sqrt(k) * Math.min(Math.max(labelPx, 11.5), 16) / labelPx;
  const lh = 1.25 * u; // one label line, in rink units
  // Where the "Goalie" label goes: on the goalie's far side from the shooter.
  const gxy = r.goalie ? P(r.goalie.x, r.goalie.y) : null;
  const goalieLabelRight = gxy ? gxy[0] > shx : false;

  parts.push(`<path class="boards" d="M -13 4 V -22 A 8.5 8.5 0 0 1 -4.5 -30.5 H 4.5 A 8.5 8.5 0 0 1 13 -22 V 4"/>`);
  parts.push(`<line class="centre-line" x1="-13" x2="13" y1="0" y2="0"/>`);
  parts.push(`<line class="blue-line" x1="-13" x2="13" y1="-7.62" y2="-7.62"/>`);
  parts.push(`<line class="goal-line" x1="-12" x2="12" y1="${goalY}" y2="${goalY}"/>`);
  parts.push(`<path class="crease" d="M -1.8 ${goalY} A 1.8 1.8 0 0 0 1.8 ${goalY} Z"/>`);
  parts.push(`<rect class="net" x="-0.9" y="${goalY - 1.1}" width="1.8" height="1.1"/>`);

  let distBox = null; // the shot-distance label's box, so the defender's gap label can keep clear of it
  const strong = new Set();
  const key = (p) => p.id;
  if (r.goalie) strong.add(key(r.goalie));
  if (show.near) {
    const limit = show.near === 1 ? 1 : null;
    r.near.filter((n, i) => (limit ? i < limit : n.m <= show.near)).forEach((n) => strong.add(key(n.p)));
  }
  if (show.screening) r.screening.forEach((p) => strong.add(key(p)));

  // A defender closer than the dot sizes allow would be drawn under the shooter's ring.
  // For the single-defender cue, push its dot just outside the ring, in its real direction from the shooter.
  // The distance label still states the measured gap.
  const nudged = new Map();
  if (show.near === 1 && r.near[0]) {
    const p = r.near[0].p;
    const [x, y] = P(p.x, p.y);
    const minSep = 2.6 * z;
    const dist = Math.hypot(x - shx, y - shy);
    if (dist < minSep) {
      const [ux, uy] = dist > 0.01 ? [(x - shx) / dist, (y - shy) / dist] : [-1, 0];
      nudged.set(p.id, [shx + ux * minSep, shy + uy * minSep]);
    }
  }
  const pos = (p) => nudged.get(p.id) || P(p.x, p.y);

  // others first (faint), then highlighted, then the shooter on top
  const cls = (p, extra = "") => `skater ${p.team === "Home" ? "home" : "away"} ${extra}`;
  m.players.forEach((p) => {
    if (p === r.shooter || strong.has(key(p))) return;
    const [x, y] = P(p.x, p.y);
    parts.push(`<circle class="${cls(p, "faint")}" cx="${x}" cy="${y}" r="${0.6 * z}"/>`);
  });

  if (show.shotLine) {
    parts.push(`<line class="guide" x1="${shx}" y1="${shy}" x2="0" y2="${goalY}"/>`);
    // From very close the sentence already says the distance, and the label would sit on the goalie.
    // Whole metres, matching the "about N m" sentences.
    // Right of the line; a short shot can put that on the goalie or the "Goalie" label, and then it goes left of the line.
    const txt = `${Math.round(d.distance_to_goal_line_m)} m`;
    const my = (shy + goalY) / 2, tw = 0.64 * lh * txt.length, gh = 0.75 * z;
    const x0 = shx + 1.2 * z; // left edge of the label when it sits right of the line
    const gRight = gxy ? (goalieLabelRight ? gxy[0] + 1.4 * z + 0.64 * lh * 6 : gxy[0] + gh) : 0; // goalie square + "Goalie" label, right edge
    const gLeft = gxy ? (goalieLabelRight ? gxy[0] - gh : gxy[0] - 1.4 * z - 0.64 * lh * 6) : 0;
    const clash = gxy && x0 < gRight && x0 + tw > gLeft && Math.abs(my - 0.35 * lh - gxy[1]) < 0.5 * lh + gh;
    if (d.distance_to_goal_line_m > 5) distBox = clash
      ? { l: shx / 2 - 1.2 * z - tw, r: shx / 2 - 1.2 * z, t: my - 0.85 * lh, b: my + 0.15 * lh }
      : { l: x0, r: x0 + tw, t: my - 0.85 * lh, b: my + 0.15 * lh };
    if (d.distance_to_goal_line_m > 5) parts.push(clash
      ? `<text class="label" text-anchor="end" x="${shx / 2 - 1.2 * z}" y="${my}">${txt}</text>`
      : `<text class="label" x="${x0}" y="${my}">${txt}</text>`);
  }

  // Defenders are marked with a ring only; their names would pile onto the goalie and shooter.
  m.players.filter((p) => strong.has(key(p))).forEach((p) => {
    const [x, y] = pos(p);
    const isGoalie = r.goalie && p.id === r.goalie.id;
    if (isGoalie) {
      const h = 0.75 * z; // goalie is a square, skaters are circles, so the two never read alike
      parts.push(`<rect class="${cls(p, "goalie")}" x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" rx="${0.2 * z}"/>`);
      const out = x > shx; // label on the goalie's far side from the shooter, clear of the shooter's defender and name
      parts.push(`<text class="label" text-anchor="${out ? "start" : "end"}" x="${x + (out ? 1.4 : -1.4) * z}" y="${y + 0.5 * z}">Goalie</text>`);
      return;
    }
    parts.push(`<circle class="${cls(p)}" cx="${x}" cy="${y}" r="${0.7 * z}"/>`);
    parts.push(`<circle class="ring ring-def" cx="${x}" cy="${y}" r="${1.2 * z}"/>`);
    // Screeners stand in front of the goalie, so their labels go on the side away from the "Goalie" label;
    // with two, the upper one's label goes above its dot and the lower one's below, so they don't stack.
    if (show.screening && r.screening.some((q) => q.id === p.id)) {
      const gx = r.goalie ? P(r.goalie.x, r.goalie.y)[0] : 0;
      const away = gx > shx ? -1 : 1;
      const ys = r.screening.map((q) => P(q.x, q.y)[1]);
      const upper = r.screening.length < 2 || y <= Math.min(...ys);
      parts.push(`<text class="label" text-anchor="${away < 0 ? "end" : "start"}" x="${x + away * 1.6 * z}" y="${y + (upper ? -0.9 : 1.6) * z}">${number(p.name) || last(p.name)}</text>`);
    }
  });

  // Beside the shooter, not under him: under him is where the defender behind usually stands, and a name there hides that dot.
  // The name takes the side away from the goalie's label; the distance label then goes the other way.
  // With the single-defender cue the name goes on the side away from that defender, so it can't be read as his.
  // Decided from the card's cues, not the current one, so the name doesn't jump sides between reasons.
  const nd = r.near[0] ? P(r.near[0].p.x, r.near[0].p.y) : null;
  const closeDef = nd && fit.some((f) => f.near === 1) && Math.hypot(nd[0] - shx, nd[1] - shy) < 2.6 * z;
  const nameRight = closeDef ? nd[0] < shx : !r.goalie || P(r.goalie.x, r.goalie.y)[0] <= shx;

  if (show.near === 1 && r.near[0]) {
    const [nx, ny] = pos(r.near[0].p);
    parts.push(`<line class="guide" x1="${shx}" y1="${shy}" x2="${nx}" y2="${ny}"/>`);
    // Label goes past the defender, away from the shooter (below a defender behind him, above one in front),
    // so it never sits on the shooter's ring or name and can't be read as another player's distance.
    const below = ny > shy;
    const txt = `${r.near[0].m.toFixed(1)} m`;
    const ly = ny + (below ? 2.2 : -1.6) * z;
    // Above a defender in front of the shooter can land on the goalie; then it goes beside the defender, away from the goalie.
    const hw = 0.32 * lh * txt.length, gh = 0.75 * z;
    const onGoalie = !below && gxy && Math.abs(nx - gxy[0]) < hw + gh && Math.abs(ly - 0.35 * lh - gxy[1]) < 0.5 * lh + gh;
    // It can also land on the shot-distance label; then it goes beside the defender, away from the shot line.
    const onDist = distBox && nx + hw > distBox.l && nx - hw < distBox.r && ly - 0.85 * lh < distBox.b && ly + 0.15 * lh > distBox.t;
    if (onGoalie || onDist) {
      const t = (ny - shy) / (goalY - shy || 1), lineX = shx * (1 - t);
      const side = onDist ? (nx >= lineX ? 1 : -1) : (gxy[0] > nx ? -1 : 1);
      parts.push(`<text class="label" text-anchor="${side < 0 ? "end" : "start"}" x="${nx + side * 1.6 * z}" y="${ny + 0.35 * lh}">${txt}</text>`);
    } else parts.push(`<text class="label" text-anchor="middle" x="${nx}" y="${ly}">${txt}</text>`);
  }

  parts.push(`<circle class="${m.primary_team === "Home" ? "skater home" : "skater away"}" cx="${shx}" cy="${shy}" r="${0.75 * z}"/>`);
  parts.push(`<circle class="ring" cx="${shx}" cy="${shy}" r="${1.2 * z}"/>`);
  // The puck is not in the data. At a shot event it is on the shooter's stick, so it is drawn at the shooter, nudged away from the goal so it does not sit on the goalie.
  const len = Math.hypot(shx, shy - goalY) || 1;
  parts.push(`<circle class="puck" cx="${shx + (shx / len) * 1.2 * z}" cy="${shy + ((shy - goalY) / len) * 1.2 * z}" r="${0.35 * z}"/>`);
  // A shooter right beside the goalie can get his name on the same side as "Goalie"; keep a clear line between them.
  let nameY = shy + 0.5 * z;
  if (gxy && nameRight === goalieLabelRight) {
    const gLabelY = gxy[1] + 0.5 * z;
    if (Math.abs(nameY - gLabelY) < 1.5 * lh) nameY = gLabelY + 1.5 * lh;
  }
  parts.push(`<text class="label" x="${shx + (nameRight ? 1.7 : -1.7) * z}" text-anchor="${nameRight ? "start" : "end"}" y="${nameY}">${label(m.primary_player)}</text>`);

  const alt = `Rink seen from above, attacking the goal at the top. ${m.players.length} skaters shown. ${label(m.primary_player)} is ringed and shoots; the goalie is the square.`;
  return `<svg class="rink" style="--u:${u}" viewBox="${vx0} ${vy0} ${vx1 - vx0} ${vy1 - vy0}" role="img" aria-label="${alt}">${parts.join("")}</svg>`;
}


// ---------- rink height ----------
// The rink's max-height in px, read from style.css so the cap lives in one place (svh, not innerHeight).
// Portrait demo: measured on each render, no resize/rotation handling.
function rinkMaxHeight() {
  const probe = document.createElement("svg");
  probe.className = "rink";
  probe.style.cssText = "position:absolute;visibility:hidden";
  (document.getElementById("app") || document.body).appendChild(probe); // where the rink goes, so card- and layout-specific caps apply
  const h = parseFloat(getComputedStyle(probe).maxHeight) || 0;
  probe.remove();
  return h;
}

// `revealed` false = question screen: the attacker is left out so the sketch doesn't give the answer away.

// ---------- the card, shown in a modal ----------
// Flow per card: clip plays -> pauses just before the shot, question over the frame -> tap -> clip plays on ->
// answer (the result) -> "Show me why" -> clues on the rink one at a time -> next moment.
// Without a clip (public build: footage is confidential) the card starts at the question over the rink.
const modal = document.getElementById("modal");
const video = document.getElementById("clip");
const videoWrap = document.getElementById("video-wrap");
const hasClip = new Map(); // card id -> whether its clip exists (checked once with a HEAD request)

async function clipExists(id) {
  if (data.synthetic) return false; // the public build has no footage: never request clips
  if (!hasClip.has(id)) {
    try { hasClip.set(id, (await fetch(CLIP_URL(id), { method: "HEAD", cache: "no-cache" })).ok); }
    catch { hasClip.set(id, false); }
  }
  return hasClip.get(id);
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let startToken = 0; // only the most recent startCard() may take over the modal
async function startCard(i) {
  const token = ++startToken;
  const id = CARDS[i].id;
  app.innerHTML = ""; // don't leave the previous card's buttons clickable while the clip check runs
  document.getElementById("video-overlay").innerHTML = "";
  const useClip = await clipExists(id);
  if (token !== startToken || modal.hidden) return;
  // Reduced motion: no autoplay. The card opens on the paused frame (as after Skip) and the answer doesn't replay the clip.
  state = { card: i, stage: useClip && !reduceMotion.matches ? "video" : "ask", answer: null, cue: 0 };
  if (useClip) {
    video.src = CLIP_URL(id);
    if (reduceMotion.matches) { video.currentTime = CARDS[i].pauseAt ?? PAUSE_AT_S; }
    else { video.currentTime = 0; video.play().catch(() => {}); }
  } else {
    video.removeAttribute("src");
  }
  document.getElementById("widget").scrollTop = 0;
  render();
}

video.addEventListener("timeupdate", () => {
  if (state.stage === "video" && video.currentTime >= (CARDS[state.card].pauseAt ?? PAUSE_AT_S)) {
    video.pause();
    state = { ...state, stage: "ask" };
    render();
  }
});
video.addEventListener("ended", () => {
  if (state.stage === "replay") { state = { ...state, stage: "answer" }; render(); }
  // A clip shorter than the pause point still gets its question.
  else if (state.stage === "video") { state = { ...state, stage: "ask" }; render(); }
});
video.addEventListener("error", () => {
  if (!video.getAttribute("src")) return;
  hasClip.set(CARDS[state.card].id, false);
  if (state.stage === "video" || state.stage === "replay") { state = { ...state, stage: state.stage === "video" ? "ask" : "answer" }; }
  video.removeAttribute("src");
  // On the reasons screens the clip is already paused and out of view; re-rendering would pull a reader who scrolled up back down.
  if (state.stage === "cue") return;
  render();
});

function render() {
  const card = CARDS[state.card];
  progress.textContent = state.stage === "done" ? "" : `Moment ${state.card + 1} of ${CARDS.length}`;
  const widget = document.getElementById("widget");
  widget.dataset.stage = state.stage;
  if (state.stage === "done") {
    videoWrap.hidden = true;
    widget.scrollTop = 0;
    widget.classList.remove("wide");
    app.classList.remove("why-layout");
    document.getElementById("context").innerHTML = "";
    const rows = CARDS.map((c, i) => {
      const r = results[i];
      if (!r) return "";
      const m = byId(c.id);
      return `<li><span class="rc-mark ${r.right ? "yes" : "no"}" aria-hidden="true">${r.right ? "✓" : "✗"}</span>
        <span class="rc-body"><strong>${label(m.primary_player)}</strong> · rated ${chance(m.xg)}<br>
        You said ${c.options[r.answer]}${r.right ? "" : `. Data says ${c.options[rightOf(c)]}`}<span class="sr-only">${r.right ? ", correct" : ", not matching the data"}</span></span></li>`;
    }).join("");
    const done = results.filter(Boolean);
    const hit = done.filter((r) => r.right).length;
    app.innerHTML = `<section class="panel"><p class="question">You called ${hit} of ${done.length}.</p>
      <ol class="recap-list">${rows}</ol>
      <p class="sentence takeaway">Rule of thumb: a shot rated 1 in 10 or better is a real chance. Even real chances mostly don't go in.</p>
      <button class="primary" data-act="close">Back to the match</button></section>`;
    announceAndFocus();
    return;
  }
  const m = byId(card.id);
  const cues = card.cues(m);
  const clip = !!video.getAttribute("src");
  const onVideo = clip && ["video", "ask", "replay", "answer"].includes(state.stage);
  videoWrap.hidden = !onVideo;
  // Same wide window from the clip through the reasons, so "Show me why" doesn't jump to a different size.
  // Without a clip the rink stands in for it at every step: rink left, text right, so the pop-up fits a laptop screen.
  const twoCol = !onVideo && ["ask", "answer", "cue"].includes(state.stage);
  widget.classList.toggle("wide", onVideo || twoCol);
  app.classList.toggle("why-layout", twoCol); // set before the rink is drawn: its size depends on this layout
  videoWrap.classList.toggle("asking", state.stage === "ask");
  if (state.stage === "ask") askShownAt = Date.now();
  const recap = state.answer === null ? "" : `<p class="recap">${card.question} <strong>You said ${card.options[state.answer]}.</strong></p>`;
  const sc = scoreBefore(m.period, m.match_clock_s);
  const context = `${PERIOD[m.period]} · ${clock(m.match_clock_s)} · ${short("Home")} ${sc.Home}–${sc.Away} ${short("Away")}`;
  // Text alternative for the clip; hidden from assistive tech when there is no clip (synthetic data).
  if (clip) { video.setAttribute("aria-label", `Clip of the moment: ${label(m.primary_player)}, ${teamName(m.primary_team)}, ${PERIOD[m.period]} ${clock(m.match_clock_s)}; the question appears when it pauses`); video.removeAttribute("aria-hidden"); }
  else { video.removeAttribute("aria-label"); video.setAttribute("aria-hidden", "true"); }
  // Names the player the question is about. No ring on the footage: the camera pans and there is no pixel calibration.
  const who = `<p class="who"><span class="who-dot ${m.primary_team === "Home" ? "home" : "away"}" aria-hidden="true"></span><span>Shot by <strong>${label(m.primary_player)}</strong>, ${teamName(m.primary_team)}</span></p>`;
  const askBody = `${who}<p class="question">${card.question}</p>
      <div class="answers">${card.options.map((o, i) => `<button data-act="answer" data-i="${i}">${o}</button>`).join("")}</div>`;
  let body = "";
  let rink = "";

  if (state.stage === "video") {
    body = `<p class="watch">Watch ${label(m.primary_player)}. We'll pause so you can make your call.</p>
      <button class="ghost" data-act="skip">Skip to the question</button>`;
  } else if (state.stage === "ask") {
    body = askBody;
  } else if (state.stage === "replay") {
    body = `<p class="recap one-line">${card.question} <strong>You said ${card.options[state.answer]}.</strong> <span class="watching">Here's what happened…</span></p>`;
  } else if (state.stage === "answer") {
    body = `${recap}<p class="headline">A shot like this goes in ${chanceSentence(m.xg)}.</p>
      <p class="mark ${results[state.card].right ? "yes" : "no"}">${results[state.card].right ? "✓ You called it." : `✗ Not this time. The data says ${card.options[rightOf(card)]}.`}</p>
      ${scaleBar(m.xg)}
      <p class="sentence">${outcome(m)}</p>
      <button class="primary" data-act="why">Show me why</button>
      <p class="source">WiseHockey's tracking data rates every shot on its distance and angle to the net, players blocking the goalie's view, the passes just before it and where the goalie stands.</p>`;
  } else {
    const last = state.cue >= cues.length - 1;
    const reasons = cues.slice(0, state.cue + 1).map((c, i) => `<li class="${i === state.cue ? "now" : ""}">${c.text}</li>`).join("");
    body = `${recap}<h2 class="why-title">${card.why}</h2>
      <ol class="reasons">${reasons}</ol>
      ${last ? `<p class="conclusion"><strong>So:</strong> ${verdictOf(card)}</p>` : ""}
      <button class="primary" data-act="${last ? "next" : "cue"}">${last ? (state.card === CARDS.length - 1 ? "See how you did" : "Next moment") : "Next reason"}</button>`;
  }
  if (!onVideo) {
    const show = state.stage === "cue" ? cues[Math.min(state.cue, cues.length - 1)].show : { shotLine: false };
    const sym = (inner) => `<svg viewBox="-6 -6 12 12" aria-hidden="true">${inner}</svg>`;
    const key = `<ul class="key-list" aria-label="Key">
      <li>${sym('<circle r="4.5" class="k-home"/>')}${teamName("Home")}</li>
      <li>${sym('<circle r="4.5" class="k-away"/>')}${teamName("Away")}</li>
      <li>${sym('<circle r="3" class="k-ink"/><circle r="5.2" class="k-ring"/>')}The shooter</li>
      ${roles(m).goalie ? `<li>${sym(`<rect x="-4" y="-4" width="8" height="8" rx="1" class="${roles(m).goalie.team === "Home" ? "k-home" : "k-away"}"/>`)}The goalie</li>` : ""}
      <li>${sym('<circle r="2" class="k-puck"/>')}The puck</li>
    </ul>`;
    rink = `<div class="why-rink">${rinkSvg(m, show, cues.map((c) => c.show))}${key}</div>`;
  }
  // On the clip, the question, the replay note and the answer all sit over the frame, in the same place.
  const overClip = onVideo && ["video", "ask", "replay", "answer"].includes(state.stage);
  document.getElementById("video-overlay").innerHTML = overClip ? (state.stage === "ask" ? askBody : body) : "";
  document.getElementById("context").innerHTML = context;
  app.innerHTML = `${rink}${!body || overClip ? "" : `<section class="panel">${body}</section>`}`;
  announceAndFocus(card, m, cues);
  revealNewest();
}

// On a phone the primary button is sticky at the bottom; after a step, make sure the newest content isn't hidden under it.
function revealNewest() {
  const widget = document.getElementById("widget");
  if (!widget || modal.hidden) return;
  if (state.stage === "video" || state.stage === "replay") return; // a clip is playing: don't jump the scroll
  widget.scrollTop = 0;
  if ((widget.classList.contains("wide") && matchMedia("(min-width: 761px)").matches) || (state.stage !== "answer" && state.stage !== "cue")) return;
  const target = state.stage === "answer" ? widget.querySelector(".mark")
    : widget.querySelector(".conclusion") || widget.querySelector(".reasons li.now");
  if (!target) return;
  const btn = widget.querySelector("button.primary");
  const limit = Math.min(widget.getBoundingClientRect().bottom, btn ? btn.getBoundingClientRect().top : Infinity);
  const over = target.getBoundingClientRect().bottom - limit;
  if (over > 0) widget.scrollTop = over + 12;
}

// ---------- keyboard and screen-reader handling ----------
// The pop-up is replaced piece by piece on every step, so focus would fall back to <body> and nothing would be read out.
// After each render: say what changed through one live region that is never re-rendered, and put focus on the first action.
const live = document.getElementById("live");
const plain = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent.replace(/\s+/g, " ").trim(); };
function announceAndFocus(card, m, cues) {
  if (modal.hidden) return; // a late clip error can re-render a closed pop-up; say nothing then
  let say = "";
  if (state.stage === "done") say = `You called ${results.filter((r) => r && r.right).length} of ${results.filter(Boolean).length}.`;
  else if (state.stage === "ask") say = `Shot by ${label(m.primary_player)}, ${teamName(m.primary_team)}. ${card.question}`;
  else if (state.stage === "replay") say = "Here's what happened.";
  else if (state.stage === "answer") say = `A shot like this goes in ${chanceSentence(m.xg)}. ${results[state.card].right ? "You called it." : `Not this time. The data says ${card.options[rightOf(card)]}.`}`;
  else if (state.stage === "cue") {
    const c = cues[Math.min(state.cue, cues.length - 1)];
    say = `${state.cue === 0 ? card.why + ". " : ""}${plain(c.text)}${state.cue >= cues.length - 1 ? ` So: ${verdictOf(card)}` : ""}`;
  }
  live.textContent = say;
  const q = state.stage === "ask" && modal.querySelector(".question");
  if (q) { q.tabIndex = -1; q.focus({ preventScroll: true }); return; } // focusing an answer made it look preselected
  const target = modal.querySelector("#video-overlay button, #app button");
  (target || document.getElementById("widget")).focus({ preventScroll: true });
}

modal.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "close") return closeModal();
  if (act === "answer") {
    if (Date.now() - askShownAt < 400) return;
    // Replay the rest of the clip, unless it already ended. With no Skip button, a replay that can't play
    // (play() rejected, or the clip stalls) must still reach the answer: fall back after the remaining time + 2 s.
    const canReplay = video.getAttribute("src") && !video.ended && !reduceMotion.matches;
    state = { ...state, answer: Number(b.dataset.i), stage: canReplay ? "replay" : "answer" };
    results[state.card] = { answer: state.answer, right: state.answer === rightOf(CARDS[state.card]) };
    if (canReplay) {
      const token = startToken; // a reopened or next card gets a new token, so an old timer can't fire into it
      const toAnswer = () => { if (state.stage === "replay" && token === startToken) { state = { ...state, stage: "answer" }; render(); } };
      video.play().catch(toAnswer);
      setTimeout(toAnswer, Math.max(3, (video.duration || 6) - video.currentTime + 2) * 1000);
    }
  } else if (act === "skip") { video.currentTime = CARDS[state.card].pauseAt ?? PAUSE_AT_S; video.pause(); state = { ...state, stage: "ask" };
  } else if (act === "why") { video.pause(); state = { ...state, stage: "cue", cue: 0 }; }
  else if (act === "cue") state = { ...state, cue: state.cue + 1 };
  else if (act === "next") return state.card + 1 >= CARDS.length ? (state = { ...state, stage: "done" }, render()) : startCard(state.card + 1);
  render();
});

let opener = null;
const background = () => [...document.body.children].filter((el) => el !== modal && !el.matches("script, #live"));
function openModal(i) {
  results = []; // each session recaps only its own calls
  opener = document.activeElement;
  background().forEach((el) => el.inert = true);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  startCard(i);
  modal.querySelector(".modal-close").focus();
}
function closeModal() {
  startToken++; // cancel a pending startCard()
  video.pause();
  modal.hidden = true;
  background().forEach((el) => el.inert = false);
  document.body.classList.remove("modal-open");
  live.textContent = "";
  if (opener && opener.isConnected) opener.focus();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

// ---------- the mock match page ----------
const gameTime = (period, sec) => clock((period - 1) * 1200 + sec); // ticker shows running game time, e.g. 47:10

function renderPage() {
  const f = data.match.final;
  document.getElementById("hero-score").textContent = `${f.Home} : ${f.Away}`;
  const cardAt = (period, sec) => CARDS.findIndex((c) => { const m = byId(c.id); return m.period === period && Math.abs(m.match_clock_s - sec) < 1; });
  const events = [];
  const score = { Home: 0, Away: 0 };
  data.match.goals.forEach((g) => {
    score[g.team] += 1;
    events.push({ period: g.period, sec: g.clock_s, team: g.team, kind: "goal",
      text: `<strong>Goal ${score.Home}:${score.Away}</strong> ${label(g.player)}${g.strength.endsWith("Powerplay") ? " (power play)" : ""}`,
      card: cardAt(g.period, g.clock_s) });
  });
  // The data lists a double minor as two identical penalty events; the ticker shows it once.
  const seen = new Map();
  data.match.penalties.forEach((p) => {
    const k = `${p.period}|${p.clock_s}|${p.player}|${p.reason}`;
    if (seen.has(k)) { seen.get(k).double = true; return; }
    const e = { period: p.period, sec: p.clock_s, team: p.team, kind: "penalty", p, card: -1 };
    seen.set(k, e);
    events.push(e);
  });
  seen.forEach((e) => {
    const who = e.p.player ? label(e.p.player) : "Bench";
    e.text = `<strong>Penalty</strong> ${who}${e.p.reason ? `, ${e.p.reason.toLowerCase()}` : ""}${e.double ? " (double minor)" : ""}`;
  });
  // Non-goal moments (a big save, a big miss) get their own ticker line.
  CARDS.forEach((c, i) => {
    const m = byId(c.id);
    if (m.shot_result === "Goal") return;
    events.push({ period: m.period, sec: m.match_clock_s, team: m.primary_team, kind: "chance",
      text: `<strong>Scoring chance</strong> ${label(m.primary_player)}, ${m.shot_result.toLowerCase()}`, card: i });
  });
  [1, 2, 3].forEach((p) => events.push({ period: p, sec: 1200, team: null, kind: "period",
    text: p === 3 ? `<strong>Final</strong> ${f.Home}:${f.Away}` : `<strong>End of ${PERIOD[p]}</strong>`, card: -1 }));
  events.sort((a, b) => b.period - a.period || b.sec - a.sec); // newest first, like a live ticker

  const rows = events.map((e) => {
    const call = e.card >= 0 ? `<button class="call" data-call="${e.card}">Call the play</button>` : "";
    const item = `<div class="t-item ${e.kind}">${e.text}${call}</div>`;
    if (!e.team) return `<li class="t-row t-center"><span class="t-time">${gameTime(e.period, e.sec)}</span><div class="t-item ${e.kind}">${e.text}</div></li>`;
    return `<li class="t-row"><div class="t-home">${e.team === "Home" ? item : ""}</div>
      <span class="t-time">${gameTime(e.period, e.sec)}</span>
      <div class="t-away">${e.team === "Away" ? item : ""}</div></li>`;
  }).join("");
  document.getElementById("ticker-list").innerHTML = rows;
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-call]");
  if (b) openModal(Number(b.dataset.call));
});

async function loadData() {
  const wantSynthetic = new URLSearchParams(location.search).get("data") === "synthetic";
  if (!wantSynthetic) {
    let res = null;
    try { res = await fetch(DATA_URL, { cache: "no-cache" }); } catch { /* network error: fall through to the synthetic match */ }
    // Only a missing file (network error or non-OK status, e.g. the public host has no data/ folder) falls back.
    // A real file that does not parse throws here and shows the error row.
    if (res && res.ok) return res.json();
  }
  const res = await fetch(SYNTHETIC_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

const DEMO_NOTE = "<strong>Fictional match, synthetic data.</strong> Works: the six cards end to end. In development: auto-picked moments, daily streak, crowd results, live data, other languages.";

// Team names, crests, title and breadcrumb come from the data when it names the teams; index.html keeps the defaults.
function applyChrome() {
  const set = (sel, text) => document.querySelectorAll(sel).forEach((el) => { el.textContent = text; });
  if (data.match.team_names) {
    set(".tn-home", teamName("Home").toUpperCase());
    set(".tn-away", teamName("Away").toUpperCase());
    set(".crest-home", short("Home"));
    set(".crest-away", short("Away"));
    set(".th-name-home", teamName("Home"));
    set(".th-name-away", teamName("Away"));
    set("#crumb-match", `${short("Home")} - ${short("Away")}`);
    document.title = `${short("Home")} vs. ${short("Away")} – Call the play (mock-up)`;
  }
  if (data.synthetic) {
    const note = document.getElementById("demo-note");
    note.innerHTML = DEMO_NOTE;
    note.hidden = false;
  }
}

async function start() {
  try {
    data = await loadData();
    // Play in match-time order. Done at runtime because each data set has its own periods and clocks; everything else indexes CARDS by position.
    CARDS.sort((x, y) => { const p = byId(x.id), q = byId(y.id); return p.period - q.period || p.match_clock_s - q.match_clock_s; });
    applyChrome();
    renderPage();
  } catch (e) {
    console.error(e);
    document.getElementById("ticker-list").innerHTML = `<li class="t-empty">No moment data yet. Run <code>python3 scripts/extract_moments.py --csv …</code> and reload.</li>`;
  }
}
start();

import { noteByMidi } from "./music.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LETTERS = "CDEFGAB";
const SHARP_ORDER = ["F5", "C5", "G5", "D5", "A4", "E5", "B4"];
const FLAT_ORDER = ["B4", "E5", "A4", "D5", "G4", "C5", "F4"];
const ACCIDENTALS = { "-1": "♭", 0: "♮", 1: "♯" };
const ACCIDENTAL_NAMES = { "-1": " flat", 0: "", 1: " sharp" };

function svgElement(tag, attributes = {}, value) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, attribute] of Object.entries(attributes)) {
    element.setAttribute(key, attribute);
  }
  if (value !== undefined) element.textContent = value;
  return element;
}

function line(x1, y1, x2, y2, className) {
  return svgElement("line", { x1, y1, x2, y2, class: className });
}

const DIAGRAM_KEYS = [
  { id: "T", label: "T", name: "B-natural thumb", x: 21, y: 49 },
  { id: "L1", label: "1", name: "left index", x: 57, y: 49 },
  { id: "L2", label: "2", name: "left middle", x: 83, y: 49 },
  { id: "L3", label: "3", name: "left ring", x: 109, y: 49 },
  { id: "G#", label: "G♯", name: "left G-sharp pinky", x: 125, y: 74 },
  { id: "R1", label: "1", name: "right index", x: 157, y: 49 },
  { id: "R2", label: "2", name: "right middle", x: 185, y: 49 },
  { id: "R3", label: "3", name: "right ring", x: 213, y: 49 },
  { id: "D-trill", label: "D", name: "D trill key", x: 171, y: 74 },
  { id: "D#-trill", label: "D♯", name: "D-sharp trill key", x: 200, y: 74 },
  { id: "Eb", label: "E♭", name: "right E-flat pinky", x: 248, y: 49 },
  { id: "C#", label: "C♯", name: "low C-sharp foot key", x: 276, y: 49 },
  { id: "C", label: "C", name: "low C foot key", x: 304, y: 49 },
];

function fingeringSummary(keys) {
  const pressed = [];
  for (const [prefix, hand] of [["L", "Left"], ["R", "Right"]]) {
    const fingers = keys.filter(key => /^[LR][1-3]$/.test(key) && key[0] === prefix);
    if (fingers.length) pressed.push(hand + " " + fingers.map(key => key[1]).join(", "));
  }
  const otherKeys = { T: "B thumb", "G#": "G♯ pinky", Eb: "E♭ pinky", "C#": "Low C♯", C: "Low C", "D-trill": "D trill", "D#-trill": "D♯ trill" };
  for (const key of keys) {
    if (otherKeys[key]) pressed.push(otherKeys[key]);
  }
  return "Press " + pressed.join(" · ");
}

export function renderFingering(note) {
  const chartNote = noteByMidi(note?.midi);
  const figure = document.createElement("figure");
  figure.className = "notation-fingering";
  if (!chartNote) return figure;
  const label = note.label ?? chartNote.label;
  const activeKeys = DIAGRAM_KEYS.filter(key => chartNote.keys.includes(key.id));
  const diagram = svgElement("svg", {
    viewBox: "0 0 325 90",
    class: "fingering-diagram",
    role: "img",
    "aria-label": label + " fingering. Press " + activeKeys.map(key => key.name).join(", ") + ".",
  });

  diagram.append(
    svgElement("text", { x: 83, y: 20, class: "fingering-group-label" }, "Left hand"),
    svgElement("text", { x: 185, y: 20, class: "fingering-group-label" }, "Right hand"),
    svgElement("text", { x: 276, y: 20, class: "fingering-group-label" }, "Pinky / foot"),
    line(21, 49, 304, 49, "fingering-key-line"),
  );

  for (const key of DIAGRAM_KEYS) {
    const pressed = chartNote.keys.includes(key.id);
    const group = svgElement("g", { class: pressed ? "fingering-key is-pressed" : "fingering-key" });
    group.append(
      svgElement("circle", { cx: key.x, cy: key.y, r: 11 }),
      svgElement("text", { x: key.x, y: key.y }, key.label),
    );
    diagram.append(group);
  }

  const caption = document.createElement("figcaption");
  caption.className = "fingering-keys";
  caption.textContent = fingeringSummary(chartNote.keys);
  caption.setAttribute("aria-hidden", "true");
  figure.append(diagram, caption);
  return figure;
}

const TOP = 63;
const BOTTOM = 101;
const STEP = (BOTTOM - TOP) / 8;
const WIDTH = 576;
const NOTE_CAPACITY = 9;

function staffStep(letter, octave) {
  return LETTERS.indexOf(letter) + (octave - 4) * 7 - 2;
}

function staffY(step) {
  return BOTTOM - step * STEP;
}

function addLedgerLines(group, x, step) {
  const direction = Math.sign(step);
  const first = step < 0 ? -2 : 10;
  for (let ledger = first; direction * (step - ledger) >= 0; ledger += 2 * direction) {
    const y = staffY(ledger);
    group.append(line(x - 12, y, x + 12, y, "staff-ledger-line"));
  }
}

function drawNote(note, x, accidentalLabel, noteIndex, selectedIndex, onNote) {
  const step = staffStep(note.letter, note.octave);
  const y = staffY(step);
  const group = svgElement("g", { class: "engraved-note" });

  if (onNote) {
    const name = note.letter + ACCIDENTAL_NAMES[note.accidental] + " " + note.octave;
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", "Show fingering for " + name + ", note " + (noteIndex + 1));
    group.setAttribute("aria-pressed", String(noteIndex === selectedIndex));
    group.setAttribute("data-note-index", noteIndex);
    group.append(svgElement("rect", { x: x - 21, y: 7, width: 42, height: 137, rx: 6, class: "staff-note-target" }));
    group.addEventListener("click", () => onNote(note, noteIndex));
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onNote(note, noteIndex);
      }
    });
  }
  if (step <= -2 || step >= 10) addLedgerLines(group, x, step);
  if (accidentalLabel) {
    group.append(svgElement("text", { x: x - 13, y, class: "staff-accidental" }, accidentalLabel));
  }

  const isOpen = note.beats >= 2;
  group.append(svgElement("ellipse", {
    cx: x, cy: y, rx: note.beats === 4 ? 7.5 : 6.6, ry: 4.5,
    transform: "rotate(-16 " + x + " " + y + ")",
    class: isOpen ? "staff-notehead is-open" : "staff-notehead",
  }));
  if (note.beats < 4) {
    const stemUp = step < 4;
    const stemX = x + (stemUp ? 5.9 : -5.9);
    const stemEnd = y + (stemUp ? -32 : 32);
    group.append(line(stemX, y, stemX, stemEnd, "staff-stem"));
    const flags = note.beats <= 0.25 ? 2 : Number(note.beats <= 0.75);
    for (let flag = 0; flag < flags; flag++) {
      const direction = stemUp ? 1 : -1;
      const flagY = stemEnd + flag * 8 * direction;
      const path = "M " + stemX + " " + flagY + " q 3 " + (7 * direction)
        + " 9 " + (10 * direction) + " q 3 " + (3 * direction) + " 2 " + (8 * direction);
      group.append(svgElement("path", { d: path, class: "staff-flag" }));
    }
  }
  if ([0.75, 1.5, 3].includes(note.beats)) {
    const dotY = step % 2 === 0 ? y - STEP : y;
    group.append(svgElement("circle", { cx: x + 13, cy: dotY, r: 1.9, class: "staff-duration-dot" }));
  }
  return group;
}

function drawEighthRest(x) {
  const y = staffY(5);
  const rest = svgElement("g", { class: "staff-eighth-rest", role: "img", "aria-label": "Eighth rest" });
  rest.append(
    svgElement("circle", { cx: x - 3, cy: y, r: 2.8, fill: "currentColor" }),
    svgElement("path", {
      d: `M${x - 3} ${y + 1} q4 5 10 -2 l-6 17`,
      fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round",
    }),
  );
  return rest;
}

function scoreSystems(item) {
  const { notes, kind } = item;
  const capacity = kind === "major" || kind === "minor" ? 8 : NOTE_CAPACITY;
  const systems = [];
  let start = 0;
  while (start < notes.length) {
    let end = Math.min(start + capacity, notes.length);

    // Keep a measure intact, even when the preceding measure uses extra notes.
    while (end < notes.length && end > start && notes[end].bar !== undefined && notes[end].bar === notes[end - 1].bar) {
      end--;
    }
    if (end === start) end = Math.min(start + capacity, notes.length);
    systems.push({ start, notes: notes.slice(start, end) });
    start = end;
  }
  return systems;
}

function addClef(svg) {
  const path = "M27 109c1.5 6-1.7 10-6.7 10-3.8 0-6.4-2.7-6.4-5.5 0-2.7 1.9-4.2 4-4.2"
    + " M27 109 18.7 63c-3.9-20.7 1.8-34.1 8.8-40.8 5.3 7.1 5.1 15.9.4 24.4"
    + " C20.6 60.1 7.7 64.6 7.7 79c0 12.2 8.4 17.6 17.1 17.6 9.1 0 14.2-6.2 14.2-13.1"
    + " 0-7.6-5.4-12.7-11.4-12.7-6.2 0-10.1 4.8-10.1 10.2 0 3.6 1.4 6.2 4.4 8";
  svg.append(svgElement("path", { d: path, class: "staff-clef" }));
}

function addSignature(svg, signature, meter) {
  let x = 51;
  for (const [order, sign] of [[SHARP_ORDER, 1], [FLAT_ORDER, -1]]) {
    for (const placement of order) {
      const [letter, octave] = placement;
      if (signature[letter] !== sign) continue;
      const y = staffY(staffStep(letter, Number(octave)));
      svg.append(svgElement("text", { x, y, class: "staff-key-sign" }, ACCIDENTALS[sign]));
      x += 13;
    }
  }
  if (meter) {
    svg.append(
      svgElement("text", { x: x + 5, y: TOP + 10, class: "staff-meter" }, meter[0]),
      svgElement("text", { x: x + 5, y: BOTTOM - 10, class: "staff-meter" }, meter[1]),
    );
    x += 23;
  }
  return x;
}

function drawSystem(system, item, selectedIndex, onNote, showFingerings) {
  const label = item.title + " staff, notes " + (system.start + 1) + " through " + (system.start + system.notes.length);
  const svg = svgElement("svg", {
    viewBox: "0 0 " + WIDTH + " 151",
    class: "score-staff",
    role: onNote ? "group" : "img",
    "aria-label": label,
  });

  for (let step = 0; step <= 8; step += 2) {
    const y = staffY(step);
    svg.append(line(4, y, WIDTH - 5, y, "staff-line"));
  }
  addClef(svg);
  const signature = item.signature ?? {};
  const startX = addSignature(svg, signature, item.meter) + 21;
  const spacing = (WIDTH - 24 - startX) / Math.max(system.notes.length, 5);
  let activeAccidentals = {};
  let bar = system.notes[0].bar;

  system.notes.forEach((note, offset) => {
    const x = startX + spacing * (offset + 0.5);
    if (note.bar !== bar) {
      svg.append(line(x - spacing / 2, TOP, x - spacing / 2, BOTTOM, "staff-barline"));
      activeAccidentals = {};
      bar = note.bar;
    }
    if (note.midi === null) {
      svg.append(drawEighthRest(x));
      return;
    }
    const key = note.letter + note.octave;
    const current = activeAccidentals[key] ?? signature[note.letter] ?? 0;
    const accidental = note.accidental === current ? "" : ACCIDENTALS[note.accidental];
    activeAccidentals[key] = note.accidental;
    svg.append(drawNote(note, x, accidental, system.start + offset, selectedIndex, onNote));
    if (showFingerings) {
      svg.append(svgElement("text", { x, y: 143, class: "staff-note-label", "aria-hidden": "true" }, note.label));
    }
  });

  const isFinal = system.start + system.notes.length === item.notes.length;
  const x = WIDTH - 6;
  svg.append(line(x, TOP, x, BOTTOM, "staff-barline"));
  if (isFinal) svg.append(line(x - 5, TOP, x - 5, BOTTOM, "staff-barline"));
  return svg;
}

export function renderScore(item, { onNote, showFingerings = false, selectedIndex = -1 } = {}) {
  const score = document.createElement("div");
  score.className = "notation-score";
  for (const system of scoreSystems(item)) {
    const window = document.createElement("div");
    window.className = "score-staff-window";
    window.append(drawSystem(system, item, selectedIndex, onNote, showFingerings));
    score.append(window);
  }

  if (showFingerings) {
    const fingerings = document.createElement("ul");
    fingerings.className = "score-fingerings";
    fingerings.setAttribute("aria-label", "Fingerings in staff order");

    const seen = new Set();
    for (const note of item.notes) {
      if (note.midi === null || seen.has(note.midi)) continue;
      seen.add(note.midi);
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.className = "score-fingering-label";
      label.textContent = note.label;
      item.append(label, renderFingering(note));
      fingerings.append(item);
    }
    score.append(fingerings);
  }
  return score;
}

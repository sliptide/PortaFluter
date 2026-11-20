import { NOTES, SCALES, DRILLS, SONGS, noteByMidi } from "./music.js";
import { renderFingering, renderScore } from "./notation.js";
import { createPitchListener, pitchReading } from "./pitch.js";
import {
  createTimer, getElapsed, getReviewItems, loadPractice, MINUTE_MS,
  RECENT_MS, savePractice, updatePractice,
} from "./practice.js";

const app = document.querySelector("#app");
const announcements = document.querySelector("#announcements");
const headerTimer = document.querySelector("#header-timer");
const navigation = [...document.querySelectorAll("#main-nav [data-view]")];
const views = navigation.map(({ dataset }) => dataset.view);
const catalogs = { scales: SCALES, drills: DRILLS, songs: SONGS };
const catalogLabels = { scales: "Scales", drills: "Note sets", songs: "Songs" };
const wideScore = window.matchMedia("(min-width: 1180px)");
const exercises = [...SCALES, ...DRILLS];
const initial = loadPractice(exercises.map(({ id }) => id));
let { records, timer, available: storageAvailable } = initial;
let view = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "practice";
let queueFilter = "all";
let fullQueue = false;
let chartMode = "list";
let noteSearch = "";
let cardOrder = "ordered";
let shuffledDeck = null;
let cardIndex = 0;
let cardRevealed = false;
let category = "scales";
const selections = Object.fromEntries(Object.entries(catalogs).map(([key, items]) => [key, items[0].id]));
let showFingerings = false;
let selectedScoreNote = -1;
let tuneMode = "free";
let targetMidi = 69;
let micStatus = "idle";
let latestFrequency = null;
let lastReading = null;
let spokenPitch = { midi: null, since: 0, announced: false };
let alertAudio = null;

const pitchListener = createPitchListener({
  onStatus(status) {
    micStatus = status;
    if (status !== "listening") {
      lastReading = null;
      latestFrequency = null;
      spokenPitch = { midi: null, since: 0, announced: false };
    }
    updateTuner();
  },
  onPitch(frequency) {
    latestFrequency = frequency;
    if (frequency) lastReading = { frequency, time: Date.now() };
    updateTuner();
  },
});

const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => escapes[character]);
}

function announce(message) {
  announcements.textContent = message;
}

function updateText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function persist() {
  const saved = savePractice(records, timer);
  if (!saved && storageAvailable) announce("Browser storage is unavailable. Changes last for this visit.");
  storageAvailable = saved;
  const warning = app.querySelector("[data-storage-warning]");
  if (warning) warning.hidden = storageAvailable;
}

function viewHeader(title, detail) {
  return `<header class="view-header"><h1>${html(title)}</h1><p class="view-intro">${html(detail)}</p></header>`;
}

function pressedButton(label, action, value, active, className = "") {
  return `<button type="button" class="${className}" data-action="${action}" data-value="${html(value)}" aria-pressed="${active}">${html(label)}</button>`;
}

function dateLabel(timestamp, now = Date.now()) {
  const date = new Date(timestamp);
  if (date.toDateString() === new Date(now).toDateString()) return "Practiced today";
  return `Practiced ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: date.getFullYear() !== new Date(now).getFullYear() ? "numeric" : undefined }).format(date)}`;
}

function practiceStats(item, now = Date.now()) {
  const record = records[item.id];
  if (!record?.practicedAt) return { label: "Unpracticed", recent: false, needsWork: !!record?.needsWork };
  const recent = now - record.practicedAt < RECENT_MS;
  return { label: dateLabel(record.practicedAt, now), recent, needsWork: record.needsWork };
}

function timerView() {
  return `
    <section id="practice-timer" class="panel timer-card" aria-labelledby="timer-title" tabindex="-1">
      <div class="panel-header"><h2 id="timer-title">Practice timer</h2><span class="status-chip" data-timer-status></span></div>
      <div class="panel-body">
        <div class="timer-value" data-timer-value></div>
        <p class="timer-caption" data-timer-caption></p>
        <div class="timer-meter" aria-hidden="true">${"<span></span>".repeat(12)}</div>
        <div class="timer-controls">
          <div class="field timer-duration"><label for="timer-minutes">Goal (minutes)</label><input id="timer-minutes" data-setting="duration" type="number" min="1" max="60" step="1" inputmode="numeric" value="${timer.durationMs / MINUTE_MS}"></div>
          <div class="button-row">
            <button type="button" class="button" data-action="timer-primary"></button>
            <button type="button" class="button secondary" data-action="timer-reset">Reset</button>
          </div>
        </div>
      </div>
    </section>`;
}

function practiceView() {
  const now = Date.now();
  const due = getReviewItems(exercises, records, now);
  const next = due[0];
  const list = queueFilter === "all" ? due : due.filter(({ id }) => catalogs[queueFilter].some((item) => item.id === id));
  const visible = fullQueue ? list : list.slice(0, 5);
  const stats = Object.values(records);
  const practiced = stats.filter(({ practicedAt }) => practicedAt).length;
  const recent = stats.filter(({ practicedAt }) => practicedAt && now - practicedAt < RECENT_MS).length;
  const focus = stats.filter(({ needsWork }) => needsWork).length;

  return `
    ${viewHeader("Flute practice", "Pick up your flute and choose what to work on today.")}
    <div class="practice-layout">
        <section class="hero-card" aria-labelledby="next-practice">
          <div class="hero-copy">
            <p class="eyebrow">${next ? "Up next" : "Review queue clear"}</p>
            <h2 id="next-practice">${next ? html(next.title) : "Choose an exercise"}</h2>
            <p>${next ? html(`${next.reason} · ${next.description}`) : "Your scales and note sets are up to date."}</p>
            ${next
              ? `<button type="button" class="button" data-action="open-exercise" data-value="${html(next.id)}">Open exercise</button>`
              : '<a href="#music" class="button">Browse music</a>'}
          </div>
          <div class="hero-art" aria-hidden="true"><i></i><i></i><i></i></div>
        </section>
        ${timerView()}
        <section class="panel review-panel" aria-labelledby="review-title">
          <div class="panel-header review-header">
            <div><h2 id="review-title">Review queue</h2><p>Unplayed or last practiced at least 3 days ago.</p></div>
            <div class="segmented" role="group" aria-label="Review type">
              ${pressedButton("All", "queue-filter", "all", queueFilter === "all")}
              ${pressedButton("Scales", "queue-filter", "scales", queueFilter === "scales")}
              ${pressedButton("Note sets", "queue-filter", "drills", queueFilter === "drills")}
            </div>
          </div>
          ${list.length ? `<ul class="list practice-queue">
            ${visible.map((item) => `<li class="list-row">
              <div class="list-main"><strong>${html(item.title)}</strong><span class="list-meta">${html(item.reason)}</span></div>
              <button type="button" class="button quiet" data-action="open-exercise" data-value="${html(item.id)}" aria-label="Practice ${html(item.title)}">Practice</button>
            </li>`).join("")}
          </ul>` : '<p class="empty-state">You’re caught up on these exercises.</p>'}
          ${list.length > 5 ? `<div class="panel-footer"><button type="button" class="button quiet" data-action="expand-queue" aria-expanded="${fullQueue}">${fullQueue ? "Show fewer" : `Show all ${list.length} exercises`}</button></div>` : ""}
        </section>
        <section class="panel practice-log" aria-labelledby="log-title">
          <div class="panel-header"><h2 id="log-title">Practice log</h2></div>
          <dl class="panel-body log-stats">
            <div><dt>Practiced</dt><dd>${practiced}</dd></div>
            <div><dt>Recent</dt><dd>${recent}</dd></div>
            <div><dt>Needs work</dt><dd>${focus}</dd></div>
          </dl>
        </section>
    </div>`;
}

function normalizedNote(text) {
  return text.toLowerCase().replace(/♯/g, "#").replace(/♭/g, "b").replace(/\s+/g, "");
}

function matchingNotes() {
  const search = normalizedNote(noteSearch);
  const enharmonics = { "C♯": "D♭", "E♭": "D♯", "F♯": "G♭", "A♭": "G♯", "B♭": "A♯" };
  return NOTES.filter((note) => {
    const alias = enharmonics[note.name];
    const names = alias ? [note.label, alias + note.octave] : [note.label];
    return names.some((name) => normalizedNote(name).includes(search));
  });
}

function flashcardNotes() {
  if (cardOrder === "ordered") return matchingNotes();
  if (shuffledDeck) return shuffledDeck;

  shuffledDeck = matchingNotes();
  for (let index = shuffledDeck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledDeck[index], shuffledDeck[swapIndex]] = [shuffledDeck[swapIndex], shuffledDeck[index]];
  }
  return shuffledDeck;
}

function resetCardDeck() {
  shuffledDeck = null;
  cardIndex = 0;
  cardRevealed = false;
}

function fingeringsView() {
  return `
    ${viewHeader("Fingerings", "Concert C flute fingerings from C4 to C7.")}
    <div class="chart-filters">
      <div class="segmented" role="group" aria-label="Fingering view">
        ${pressedButton("List", "chart-mode", "list", chartMode === "list")}
        ${pressedButton("Flashcards", "chart-mode", "cards", chartMode === "cards")}
      </div>
      <div class="field note-search"><label for="note-search">Find a note</label><input id="note-search" data-setting="note-search" type="search" placeholder="e.g. F♯5" value="${html(noteSearch)}" maxlength="20" autocomplete="off"></div>
    </div>
    <div id="chart-results"></div>`;
}

function renderChart() {
  const mount = document.querySelector("#chart-results");
  const notes = chartMode === "cards" ? flashcardNotes() : matchingNotes();
  if (!notes.length) {
    mount.innerHTML = '<p class="panel empty-state">No matching notes. Try a letter name or octave.</p>';
    return;
  }

  if (chartMode === "list") {
    mount.innerHTML = `<ul class="panel fingering-list">${notes.map((note) => `
      <li class="fingering-row">
        <div><strong class="note-label">${html(note.label)}</strong></div>
        <div data-fingering-midi="${note.midi}"></div>
      </li>`).join("")}</ul>`;
  } else {
    cardIndex = Math.min(cardIndex, notes.length - 1);
    const note = notes[cardIndex];
    mount.innerHTML = `<section class="panel flashcard" aria-label="Fingering flashcard">
      <div class="flashcard-controls">
        <div class="segmented" role="group" aria-label="Flashcard order">
          ${pressedButton("In order", "card-order", "ordered", cardOrder === "ordered")}
          ${pressedButton("Random", "card-order", "random", cardOrder === "random")}
        </div>
        ${cardOrder === "random" && notes.length > 1 ? '<button type="button" class="button quiet" data-action="shuffle-cards">Shuffle again</button>' : ""}
      </div>
      <p class="eyebrow">Card ${cardIndex + 1} of ${notes.length}</p>
      <h2 class="flashcard-note">${html(note.label)}</h2>
      <div class="flashcard-answer" id="flashcard-answer" ${cardRevealed ? "" : "hidden"}>${cardRevealed ? `<div data-fingering-midi="${note.midi}"></div>` : ""}</div>
      <button type="button" class="button" data-action="reveal-card" aria-expanded="${cardRevealed}" aria-controls="flashcard-answer">${cardRevealed ? "Hide fingering" : "Reveal fingering"}</button>
      <div class="button-row flashcard-controls">
        <button type="button" class="button secondary" data-action="previous-card" ${notes.length < 2 ? "disabled" : ""}>Previous</button>
        <button type="button" class="button secondary" data-action="next-card" ${notes.length < 2 ? "disabled" : ""}>Next</button>
      </div>
    </section>`;
  }
  for (const node of mount.querySelectorAll("[data-fingering-midi]")) {
    node.append(renderFingering(noteByMidi(Number(node.dataset.fingeringMidi))));
  }
}

function currentItem() {
  return catalogs[category].find(({ id }) => selections[category] === id) ?? catalogs[category][0];
}

function rangeLabel(item) {
  const pitches = item.notes.map(({ midi }) => midi);
  return `${noteByMidi(Math.min(...pitches)).label}–${noteByMidi(Math.max(...pitches)).label}`;
}

function musicView() {
  const item = currentItem();
  const stats = practiceStats(item);
  const isExercise = category !== "songs";
  return `
    ${viewHeader("Music", "Practice scales, short note sets, and solo flute pieces.")}
    <div class="music-tabs segmented" role="group" aria-label="Music type">
      ${Object.entries(catalogLabels).map(([key, label]) => pressedButton(label, "music-category", key, category === key)).join("")}
    </div>
    <div class="music-layout">
      <div class="panel field music-catalog">
        <label for="music-choice">${catalogLabels[category]}</label>
        <select id="music-choice" data-setting="music-choice">
          ${catalogs[category].map(({ id, title }) => `<option value="${html(id)}"${id === item.id ? " selected" : ""}>${html(title)}</option>`).join("")}
        </select>
      </div>
      <section class="panel music-detail" aria-labelledby="music-title">
        <div class="panel-header music-detail-heading">
          <div><h2 id="music-title">${html(item.title)}</h2>
            ${isExercise ? "" : `<p class="list-meta">${html(`${item.composer} · ${item.level} · ${rangeLabel(item)}`)}</p>`}
            <p>${html(item.description)}</p></div>
          ${isExercise ? `<div class="score-status"><span class="status-chip">${html(stats.recent ? "Recently practiced" : stats.label)}</span>
            ${stats.needsWork ? '<span class="status-chip focus-chip">Needs more practice</span>' : ""}</div>` : ""}
        </div>
        <div class="panel-body score-body">
          <div class="score-controls">
            <div class="segmented" role="group" aria-label="Score fingering display">
              ${pressedButton("Staff only", "score-mode", "staff", !showFingerings)}
              ${pressedButton("Show fingerings", "score-mode", "fingerings", showFingerings)}
            </div>
            <p class="list-meta">Select a note for its fingering.</p>
          </div>
          <div class="score-stage">
            <div id="score"></div>
            <div id="score-hint" class="score-hint" hidden></div>
          </div>
        </div>
        ${isExercise ? `<div class="panel-footer practice-actions">
          <button type="button" class="button" data-action="practice-status" data-value="practiced">Mark practiced</button>
          ${pressedButton("Needs more practice", "practice-status", "toggle-focus", stats.needsWork, "button secondary")}
          ${records[item.id]?.practicedAt ? '<button type="button" class="button quiet" data-action="practice-status" data-value="undo">Clear practice date</button>' : ""}
        </div>` : ""}
      </section>
    </div>`;
}

function showScoreHint(note, index, speak = true) {
  selectedScoreNote = index;
  for (const node of document.querySelectorAll("#score [data-note-index]")) {
    node.setAttribute("aria-pressed", Number(node.dataset.noteIndex) === index ? "true" : "false");
  }
  const hint = document.querySelector("#score-hint");
  const heading = document.createElement("h3");
  heading.textContent = `${note.letter}${note.accidental === 1 ? "♯" : note.accidental === -1 ? "♭" : ""}${note.octave} fingering`;
  hint.replaceChildren(heading, renderFingering(note));
  hint.hidden = false;
  placeScoreHint();
  if (speak) {
    announce(`${heading.textContent}. ${hint.querySelector(".fingering-keys")?.textContent ?? ""}`.trim());
    if (!wideScore.matches && hint.getBoundingClientRect().top > window.innerHeight - 36) {
      hint.scrollIntoView({ block: "nearest" });
    }
  }
}

function placeScoreHint() {
  const hint = document.querySelector("#score-hint");
  if (!hint || hint.hidden) return;
  const stage = document.querySelector(".score-stage");
  stage.classList.toggle("has-side-hint", wideScore.matches);
  const activeNote = stage.querySelector('[data-note-index][aria-pressed="true"]');
  const system = activeNote?.closest(".score-staff-window");
  if (wideScore.matches || !system) stage.append(hint);
  else system.after(hint);
}

function mountScore() {
  const item = currentItem();
  document.querySelector("#score").replaceChildren(renderScore(item, {
    showFingerings,
    selectedIndex: selectedScoreNote,
    onNote: showScoreHint,
  }));
  if (selectedScoreNote >= 0 && item.notes[selectedScoreNote]) {
    showScoreHint(item.notes[selectedScoreNote], selectedScoreNote, false);
  }
}

function tunerView() {
  return `
    ${viewHeader("Tuner", "Play one sustained note and see how close you are to pitch.")}
    <div class="tuner-layout">
      <section class="panel tuner-display" aria-label="Pitch reading">
        <div class="panel-header"><h2>Pitch meter</h2><span class="status-chip" data-tuner-signal>Ready</span></div>
        <div class="panel-body tuner-meter">
          <div class="tuner-reading">
            <div class="tuner-note" data-tuner-note>–</div>
            <div><div class="tuner-cents" data-tuner-cents>–</div><div class="tuner-status" data-tuner-reading></div></div>
          </div>
          <div class="tuner-scale" aria-hidden="true">
            <div class="tuner-dial">
              ${Array.from({ length: 21 }, (_, index) => `<span class="dial-tick" data-position="${index - 10}"></span>`).join("")}
              <span class="tuner-needle" data-position="0" hidden></span>
            </div>
            <div class="dial-labels"><span>−50¢</span><span>0</span><span>+50¢</span></div>
          </div>
          <p class="list-meta tuner-reference" data-tuner-reference>A4 = 440 Hz</p>
        </div>
      </section>
      <section class="panel tuner-controls" aria-labelledby="listen-title">
        <div class="panel-header"><h2 id="listen-title">Listening mode</h2></div>
        <div class="panel-body">
          <div class="segmented" role="group" aria-label="Listening mode">
            ${pressedButton("Free listening", "tune-mode", "free", tuneMode === "free")}
            ${pressedButton("Target note", "tune-mode", "target", tuneMode === "target")}
          </div>
          <div class="field target-field" ${tuneMode === "target" ? "" : "hidden"}>
            <label for="target-note">Target note</label>
            <select id="target-note" data-setting="target">${NOTES.map((note) => `<option value="${note.midi}" ${note.midi === targetMidi ? "selected" : ""}>${html(note.label)}</option>`).join("")}</select>
          </div>
          <div class="button-row"><button type="button" class="button" data-action="toggle-listening"></button></div>
          <p class="tuner-message" data-tuner-message role="status"></p>
          <p class="list-meta">Your microphone audio is analyzed on this device.</p>
        </div>
      </section>
    </div>`;
}

function updateTuner() {
  const button = app.querySelector('[data-action="toggle-listening"]');
  if (!button) return;

  const messages = {
    idle: "Allow microphone access when prompted.",
    requesting: "Waiting for microphone permission.",
    listening: "Play a steady note.",
    insecure: "Microphone access requires HTTPS or localhost.",
    unavailable: "Microphone is unavailable. Check your input device and try again.",
    denied: "Microphone access was denied. Check the browser’s site permissions and try again.",
    interrupted: "Listening was interrupted. Start again when you’re ready.",
  };
  const buttonLabel = micStatus === "requesting" ? "Cancel" : micStatus === "listening" ? "Stop listening" : "Start listening";
  const message = app.querySelector("[data-tuner-message]");
  updateText(button, buttonLabel);
  updateText(message, messages[micStatus]);

  const lastFrequency = lastReading && Date.now() - lastReading.time < 5000 ? lastReading.frequency : null;
  const frequency = latestFrequency ?? lastFrequency;
  const target = tuneMode === "target" ? targetMidi : undefined;
  const result = pitchReading(frequency, target);
  const cents = result ? Math.round(result.targetCents ?? result.cents) : null;
  const note = result ? noteByMidi(result.midi) : null;
  const fallback = result ? `${["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][result.midi % 12]}${Math.floor(result.midi / 12) - 1}` : "–";
  const signal = result ? latestFrequency ? "Live" : "Last heard" : micStatus === "listening" ? "Waiting for pitch" : "Ready";
  const wrongTarget = target !== undefined && result && !result.matchesTarget;
  const pitchLabel = cents === null ? "" : wrongTarget ? (result.midi % 12 === target % 12 ? "Wrong octave" : "Different note") : Math.abs(cents) <= 5 ? "In tune" : cents < 0 ? "Flat" : "Sharp";
  updateText(app.querySelector("[data-tuner-note]"), note?.label ?? fallback);
  updateText(app.querySelector("[data-tuner-cents]"), cents === null ? "–" : `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${Math.abs(cents)}¢`);
  updateText(app.querySelector("[data-tuner-reading]"), pitchLabel);
  updateText(app.querySelector("[data-tuner-signal]"), signal);
  updateText(app.querySelector("[data-tuner-reference]"), target === undefined
    ? "A4 = 440 Hz"
    : `Target ${noteByMidi(target)?.label ?? ""} · A4 = 440 Hz`);
  const needle = app.querySelector(".tuner-needle");
  needle.hidden = cents === null;
  needle.dataset.position = String(Math.max(-10, Math.min(10, Math.round((cents ?? 0) / 5))));

  const now = Date.now();
  const liveMidi = latestFrequency ? result.midi : null;
  if (liveMidi !== spokenPitch.midi) spokenPitch = { midi: liveMidi, since: now, announced: false };
  if (liveMidi !== null && !spokenPitch.announced && now - spokenPitch.since >= 400) {
    const direction = cents < 0 ? "flat" : "sharp";
    const accuracy = cents ? `${Math.abs(cents)} cents ${direction}` : "in tune";
    const label = wrongTarget ? `${pitchLabel}, ${accuracy}` : accuracy;
    announce(`${note?.label ?? fallback}. ${label}.`);
    spokenPitch.announced = true;
  }
}

function clockText(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function releaseAlertAudio() {
  if (alertAudio && alertAudio.state !== "closed") alertAudio.close().catch(() => {});
  alertAudio = null;
}

function armAlertAudio() {
  if (alertAudio) return;
  const Audio = window.AudioContext ?? window.webkitAudioContext;
  if (!Audio) return;
  try {
    const audio = new Audio();
    alertAudio = audio;
    audio.resume().catch(() => {
      if (audio === alertAudio) releaseAlertAudio();
    });
  } catch {
    alertAudio = null;
  }
}

function soundTimer() {
  const audio = alertAudio;
  if (!audio || audio.state !== "running" || document.hidden) {
    releaseAlertAudio();
    return;
  }
  const tone = audio.createOscillator();
  const volume = audio.createGain();
  const start = audio.currentTime;
  tone.frequency.setValueAtTime(660, start);
  tone.frequency.setValueAtTime(880, start + 0.16);
  volume.gain.setValueAtTime(0.001, start);
  volume.gain.exponentialRampToValueAtTime(0.12, start + 0.035);
  volume.gain.exponentialRampToValueAtTime(0.001, start + 0.36);
  tone.connect(volume);
  volume.connect(audio.destination);
  tone.start(start);
  tone.stop(start + 0.38);
  tone.addEventListener("ended", () => {
    if (audio === alertAudio) releaseAlertAudio();
  }, { once: true });
}

function updateTimer() {
  const elapsed = getElapsed(timer);
  const remaining = timer.durationMs - elapsed;
  const complete = remaining === 0;
  if (complete && timer.startedAt) {
    timer = { ...timer, elapsedMs: timer.durationMs, startedAt: 0 };
    persist();
    announce("Practice timer complete.");
    soundTimer();
  }

  const running = Boolean(timer.startedAt);
  const status = complete ? "Complete" : running ? "Running" : elapsed ? "Paused" : "Ready";
  headerTimer.hidden = view === "practice" || (!running && !elapsed);
  updateText(headerTimer, complete ? "Practice complete" : clockText(remaining));
  headerTimer.setAttribute("aria-label", complete ? "Practice complete. Open timer." : `Open practice timer. ${status}.`);

  const countdown = app.querySelector("[data-timer-value]");
  if (!countdown) return;
  updateText(countdown, clockText(remaining));
  updateText(app.querySelector("[data-timer-status]"), status);
  updateText(app.querySelector("[data-timer-caption]"), `${clockText(elapsed)} elapsed`);
  app.querySelector('[data-setting="duration"]').disabled = Boolean(running || (elapsed && !complete));
  updateText(app.querySelector('[data-action="timer-primary"]'), complete ? "Start again" : running ? "Pause" : elapsed ? "Resume" : "Start");
  app.querySelector('[data-action="timer-reset"]').disabled = !elapsed && !running;
  app.querySelectorAll(".timer-meter > span").forEach((segment, index) => {
    segment.classList.toggle("filled", elapsed / timer.durationMs >= (index + 1) / 12);
  });
}

function readTimerGoal(input) {
  if (!input || input.disabled) return;
  const configured = createTimer(input.valueAsNumber);
  input.value = configured.durationMs / MINUTE_MS;
  if (configured.durationMs !== timer.durationMs) {
    timer = configured;
    persist();
  }
}

const renderViews = { practice: practiceView, fingerings: fingeringsView, music: musicView, tuner: tunerView };

function render() {
  for (const link of navigation) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  app.innerHTML = `<section class="view">${renderViews[view]()}</section>
    <p class="storage-warning" data-storage-warning ${storageAvailable ? "hidden" : ""}>Browser storage is unavailable. Changes last for this visit.</p>`;
  if (view === "fingerings") renderChart();
  if (view === "music") mountScore();
  if (view === "tuner") updateTuner();
  updateTimer();
}

function navigate(next, writeHash = true) {
  if (view === "tuner" && next !== view) pitchListener.stop();
  view = next;
  if (writeHash && location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
  render();
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function openExercise(id) {
  category = SCALES.some((item) => item.id === id) ? "scales" : "drills";
  selections[category] = id;
  selectedScoreNote = -1;
  navigate("music");
}

function focusAction(action, value) {
  const match = [...app.querySelectorAll(`[data-action="${action}"]`)]
    .find((button) => value === undefined || button.dataset.value === value);
  match?.focus({ preventScroll: true });
}

function restartFlashcards(action, value) {
  resetCardDeck();
  renderChart();
  focusAction(action, value);
  announce(`Card 1. ${flashcardNotes()[0].label}.`);
}

function changeCard(action) {
  const notes = flashcardNotes();
  const count = notes.length;
  if (!count) return;
  if (action === "reveal-card") {
    cardRevealed = !cardRevealed;
  } else {
    cardIndex = (cardIndex + (action === "next-card" ? 1 : -1) + count) % count;
    cardRevealed = false;
  }
  renderChart();
  focusAction(action);
  if (action !== "reveal-card") announce(`Card ${cardIndex + 1}. ${notes[cardIndex].label}.`);
}

const actions = {
  "open-exercise": openExercise,
  "queue-filter"(value) {
    queueFilter = value;
    fullQueue = false;
    render();
    focusAction("queue-filter", value);
  },
  "expand-queue"() {
    fullQueue = !fullQueue;
    render();
    focusAction("expand-queue");
  },
  "timer-primary"() {
    readTimerGoal(document.querySelector("#timer-minutes"));
    const now = Date.now();
    const elapsed = getElapsed(timer, now);
    if (timer.startedAt) {
      if (elapsed === timer.durationMs) {
        updateTimer();
        return;
      }
      timer = { ...timer, elapsedMs: elapsed, startedAt: 0 };
      releaseAlertAudio();
    } else {
      if (elapsed === timer.durationMs) timer = createTimer(timer.durationMs / MINUTE_MS);
      timer = { ...timer, startedAt: now };
      armAlertAudio();
    }
    persist();
    updateTimer();
    announce(timer.startedAt ? "Practice timer running." : "Practice timer paused.");
  },
  "timer-reset"() {
    timer = createTimer(timer.durationMs / MINUTE_MS);
    releaseAlertAudio();
    persist();
    updateTimer();
    focusAction("timer-primary");
    announce("Practice timer reset.");
  },
  "chart-mode"(value) {
    chartMode = value;
    cardRevealed = false;
    render();
    focusAction("chart-mode", value);
  },
  "card-order"(value) {
    if (cardOrder === value) return;
    cardOrder = value;
    restartFlashcards("card-order", value);
  },
  "shuffle-cards": () => restartFlashcards("shuffle-cards"),
  "reveal-card": () => changeCard("reveal-card"),
  "next-card": () => changeCard("next-card"),
  "previous-card": () => changeCard("previous-card"),
  "music-category"(value) {
    category = value;
    selectedScoreNote = -1;
    render();
    focusAction("music-category", value);
  },
  "score-mode"(value) {
    showFingerings = value === "fingerings";
    render();
    focusAction("score-mode", value);
  },
  "practice-status"(value) {
    const item = currentItem();
    records = updatePractice(records, item.id, value);
    persist();
    render();
    focusAction("practice-status", value === "undo" ? "practiced" : value);
    if (storageAvailable) {
      const message = value === "practiced" ? `${item.title} marked as practiced.` : value === "undo" ? "Practice date cleared." : records[item.id].needsWork ? "Flagged for more practice." : "Practice flag cleared.";
      announce(message);
    }
  },
  "tune-mode"(value) {
    tuneMode = value;
    spokenPitch = { midi: null, since: 0, announced: false };
    render();
    focusAction("tune-mode", value);
  },
  "toggle-listening"() {
    if (micStatus === "requesting" || micStatus === "listening") pitchListener.stop();
    else pitchListener.start();
  },
};

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) actions[button.dataset.action]?.(button.dataset.value);
});

app.addEventListener("input", ({ target }) => {
  if (target.dataset.setting === "note-search") {
    noteSearch = target.value;
    resetCardDeck();
    renderChart();
  }
});

app.addEventListener("change", ({ target }) => {
  switch (target.dataset.setting) {
    case "target":
      targetMidi = Number(target.value);
      spokenPitch = { midi: null, since: 0, announced: false };
      updateTuner();
      break;
    case "music-choice":
      if (!catalogs[category].some(({ id }) => id === target.value)) break;
      selections[category] = target.value;
      selectedScoreNote = -1;
      render();
      document.querySelector("#music-choice").focus({ preventScroll: true });
      break;
    case "duration":
      readTimerGoal(target);
      updateTimer();
      break;
  }
});

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  app.focus();
});
headerTimer.addEventListener("click", () => {
  navigate("practice");
  document.querySelector("#practice-timer")?.focus();
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (views.includes(next) || !next) navigate(next || "practice", false);
});
wideScore.addEventListener("change", placeScoreHint);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (micStatus === "listening" || micStatus === "requesting")) pitchListener.stop("interrupted");
  updateTimer();
});
window.addEventListener("pagehide", () => {
  if (micStatus === "listening" || micStatus === "requesting") pitchListener.stop();
  releaseAlertAudio();
});

render();
window.setInterval(updateTimer, 250);

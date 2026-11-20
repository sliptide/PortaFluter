import { parseNote } from "./music.js";
import { frequencyForMidi } from "./pitch.js";

function riff(title, pitches) {
  return { title, meter: [4, 4], notes: pitches.split(" ").map(parseNote) };
}

export const JAZZ_EXERCISES = [
  {
    id: "jazz-swing",
    title: "Swing",
    skill: "Jazz rhythm and articulation",
    description: "Listen to the same riff played straight and swung. Then play it over a click on beats 2 and 4.",
    patterns: [
      riff("One note", "G4:0.5 G4:0.5 G4:0.5 G4:0.5 G4 G4"),
      riff("Three notes", "G4:0.5 A4:0.5 B4 B4:0.5 A4:0.5 G4"),
    ],
  },
  {
    id: "jazz-echo",
    title: "Hear it, play it",
    skill: "Jazz phrasing and ear training",
    description: "Listen for one bar, then echo the riff on your flute. Reveal the notes to check your answer.",
    patterns: [
      riff("Two-note riff", "G4:0.5 A4:0.5 G4 G4:0.5 A4:0.5 G4"),
      riff("Three-note riff", "B4:0.5 A4:0.5 G4 A4:0.5 B4:0.5 A4"),
      riff("Short and long notes", "G4 A4:0.5 B4:0.5 A4 G4"),
    ],
  },
];

const BAR_BEATS = 4;
const TEMPOS = [50, 60, 70, 80, 90, 100, 110, 120, 140, 160];

function swingBeat(beat) {
  return beat % 1 === 0.5 ? Math.floor(beat) + 2 / 3 : beat;
}

export function jazzPlayback(notes, mode) {
  const events = [];
  const cues = [{ beat: 0, message: "Count-in" }];
  function click(beat, accented = false) {
    events.push({ beat, beats: 0.075, frequency: accented ? 1040 : 740, click: true });
  }
  for (let beat = 0; beat < BAR_BEATS; beat++) click(beat, beat === 0);

  if (mode === "practice") {
    for (let bar = 0; bar < 4; bar++) {
      const start = (bar + 1) * BAR_BEATS;
      click(start + 1, true);
      click(start + 3, true);
      cues.push({ beat: start, message: `Play · bar ${bar + 1} of 4` });
    }
    return { events, cues, endBeat: 5 * BAR_BEATS };
  }

  const feel = mode === "straight" ? (beat) => beat : swingBeat;
  let elapsed = 0;
  for (const note of notes) {
    const start = feel(elapsed);
    elapsed += note.beats;
    events.push({
      beat: BAR_BEATS + start,
      beats: (feel(elapsed) - start) * 0.84,
      frequency: frequencyForMidi(note.midi),
      click: false,
    });
  }

  const echo = mode === "echo";
  const phraseEnd = 2 * BAR_BEATS;
  cues.push({ beat: BAR_BEATS, message: echo ? "Listen" : mode === "swing" ? "Listen · swung eighths" : "Listen · straight eighths" });
  if (echo) {
    cues.push({ beat: phraseEnd, message: "Your turn · echo the phrase" });
    for (let beat = 0; beat < BAR_BEATS; beat++) click(phraseEnd + beat, beat === 0);
  }
  return { events, cues, endBeat: echo ? phraseEnd + BAR_BEATS : phraseEnd };
}

function scheduleTone(context, event, start, secondsPerBeat) {
  const length = event.beats * secondsPerBeat;
  const time = start + event.beat * secondsPerBeat;
  const tone = context.createOscillator();
  const volume = context.createGain();

  tone.type = event.click ? "sine" : "triangle";
  tone.frequency.value = event.frequency;
  volume.gain.setValueAtTime(0.001, time);
  volume.gain.linearRampToValueAtTime(event.click ? 0.10 : 0.13, time + Math.min(0.018, length / 3));
  volume.gain.exponentialRampToValueAtTime(0.001, time + length);
  tone.connect(volume);
  volume.connect(context.destination);
  tone.start(time);
  tone.stop(time + length);
}

export function createJazzPractice(onScoreChange) {
  const choices = { "jazz-swing": 0, "jazz-echo": 0 };
  let tempo = 80;
  let revealed = false;
  let panel = null;
  let item = null;
  let session = null;
  let status = "Ready";

  function updateControls(message) {
    status = message;
    if (!panel) return;
    const indicator = panel.querySelector("[data-jazz-status]");
    if (indicator.textContent !== status) indicator.textContent = status;
    panel.querySelector("#jazz-stop").disabled = !session;
    panel.querySelector("#jazz-tempo").disabled = Boolean(session);
  }

  function stop(message = "Playback stopped") {
    if (!session) return;
    const { context, timers } = session;
    session = null;
    timers.forEach(clearTimeout);
    if (context.state !== "closed") context.close().catch(() => {});
    updateControls(message);
  }

  function pickedScore(exercise) {
    return exercise.patterns[choices[exercise.id]];
  }

  async function play(mode) {
    stop();
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) {
      updateControls("Audio playback is unavailable in this browser.");
      return;
    }
    let run;
    try {
      const context = new Audio();
      run = { context, timers: [] };
      session = run;
      updateControls("Preparing audio");
      if (context.state !== "running") await context.resume();
      if (session !== run) return;
      if (context.state !== "running") throw new Error("Audio could not start");

      const { events, cues, endBeat } = jazzPlayback(pickedScore(item).notes, mode);
      const secondsPerBeat = 60 / tempo;
      const start = context.currentTime + 0.06;
      for (const event of events) scheduleTone(context, event, start, secondsPerBeat);

      function atBeat(beat, callback) {
        const delay = Math.max(0, (start + beat * secondsPerBeat - context.currentTime) * 1000);
        run.timers.push(setTimeout(() => {
          if (session === run) callback();
        }, delay));
      }

      for (const cue of cues) atBeat(cue.beat, () => updateControls(cue.message));
      atBeat(endBeat, () => stop(mode === "echo" ? "Finished · reveal the notes to check" : "Finished"));
      context.addEventListener("statechange", () => {
        if (session === run && context.state !== "running") stop("Playback interrupted. Try again when ready.");
      });
    } catch {
      if (run && session !== run) return;
      const message = "Audio could not start. Try again.";
      if (session) stop(message);
      else updateControls(message);
    }
  }

  function mount(element, exercise) {
    if (item?.id !== exercise.id) {
      stop("Ready");
      status = "Ready";
    }
    panel = element;
    item = exercise;
    const echo = exercise.id === "jazz-echo";
    panel.innerHTML = `
      <div class="jazz-settings">
        <div class="field">
          <label for="jazz-pattern">${echo ? "Echo phrase" : "Swing drill"}</label>
          <select id="jazz-pattern">
            ${exercise.patterns.map((pattern, index) => `<option value="${index}"${index === choices[exercise.id] ? " selected" : ""}>${pattern.title}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="jazz-tempo">Tempo (BPM)</label>
          <select id="jazz-tempo">
            ${TEMPOS.map((bpm) => `<option value="${bpm}"${bpm === tempo ? " selected" : ""}>${bpm}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="button-row">
        ${echo ? `
          <button type="button" class="button" data-jazz-play="echo">Play phrase</button>
          <button type="button" class="button secondary" id="jazz-reveal" aria-expanded="${revealed}" aria-controls="score">${revealed ? "Hide notes" : "Reveal notes"}</button>
        ` : `
          <button type="button" class="button secondary" data-jazz-play="straight">Hear straight</button>
          <button type="button" class="button secondary" data-jazz-play="swing">Hear swung</button>
          <button type="button" class="button" data-jazz-play="practice">Practice with click</button>
        `}
        <button type="button" class="button quiet" id="jazz-stop">Stop</button>
      </div>
      <p class="jazz-status" data-jazz-status role="status"></p>`;

    panel.querySelector("#jazz-pattern").addEventListener("change", ({ target }) => {
      choices[exercise.id] = Number(target.value);
      if (echo) revealed = false;
      stop("Ready");
      status = "Ready";
      onScoreChange(target.id);
    });
    panel.querySelector("#jazz-tempo").addEventListener("change", ({ target }) => {
      tempo = Number(target.value);
    });
    panel.querySelectorAll("[data-jazz-play]").forEach((button) => {
      button.addEventListener("click", () => play(button.dataset.jazzPlay));
    });
    panel.querySelector("#jazz-stop").addEventListener("click", () => {
      stop();
      panel.querySelector("[data-jazz-play]").focus({ preventScroll: true });
    });
    panel.querySelector("#jazz-reveal")?.addEventListener("click", () => {
      revealed = !revealed;
      onScoreChange("jazz-reveal");
    });
    updateControls(status);
  }

  function unmount() {
    stop();
    panel = null;
    item = null;
  }

  function score(exercise) {
    if (exercise.id === "jazz-echo" && !revealed) return null;
    return pickedScore(exercise);
  }

  return { mount, unmount, score, stop };
}

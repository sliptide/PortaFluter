import assert from "node:assert/strict";
import { jazzPlayback, JAZZ_EXERCISES } from "../js/jazz.js";
import { noteByMidi } from "../js/music.js";

Deno.test("Jazz practice phrases fill one bar and have complete flute fingerings", () => {
  assert.deepEqual(JAZZ_EXERCISES.map(({ id }) => id), ["jazz-swing", "jazz-echo"]);
  for (const { patterns } of JAZZ_EXERCISES) {
    for (const { notes } of patterns) {
      assert.equal(notes.reduce((beats, note) => beats + note.beats, 0), 4);
      assert.ok(notes.every(({ midi }) => noteByMidi(midi)));
    }
  }
});

Deno.test("swing shifts the offbeat and both demos keep the four-beat count-in", () => {
  const { notes } = JAZZ_EXERCISES[0].patterns[0];
  for (const mode of ["straight", "swing"]) {
    const { events, endBeat } = jazzPlayback(notes, mode);
    assert.deepEqual(events.filter(({ click }) => click).map(({ beat }) => beat), [0, 1, 2, 3]);
    const phrase = events.filter(({ click }) => !click);
    assert.equal(phrase[0].beat, 4);
    assert.equal(phrase[1].beat, 4 + (mode === "swing" ? 2 / 3 : 0.5));
    assert.equal(phrase[2].beat, 5);
    assert.equal(endBeat, 8);
  }
});

Deno.test("echo reserves a full response bar and practice clicks on beats two and four", () => {
  const { notes } = JAZZ_EXERCISES[1].patterns[0];
  const echo = jazzPlayback(notes, "echo");
  assert.equal(echo.endBeat, 12);
  assert.ok(echo.events.filter(({ click }) => !click).every(({ beat, beats }) => beat >= 4 && beat + beats <= 8));
  assert.deepEqual(echo.events.filter(({ click, beat }) => click && beat >= 8).map(({ beat }) => beat), [8, 9, 10, 11]);
  assert.deepEqual(echo.cues.map(({ beat }) => beat), [0, 4, 8]);

  const practice = jazzPlayback(notes, "practice");
  assert.equal(practice.endBeat, 20);
  assert.ok(practice.events.every(({ click }) => click));
  assert.deepEqual(practice.events.slice(4).map(({ beat }) => beat), [5, 7, 9, 11, 13, 15, 17, 19]);
});

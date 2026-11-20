import assert from "node:assert/strict";
import { HOLIDAY_SONGS, SONGS } from "../js/music.js";

Deno.test("Holiday contains the six requested scores from the song library", () => {
  assert.deepEqual(HOLIDAY_SONGS.map(({ id }) => id), [
    "greensleeves", "carol-of-the-bells", "up-on-the-housetop",
    "jingle-bells", "silent-night", "we-three-kings",
  ]);
  assert.ok(HOLIDAY_SONGS.every((song) => SONGS.includes(song)));
});

Deno.test("Holiday scores keep the meter and count eighth rests without a pitch", () => {
  let rests = 0;
  for (const song of HOLIDAY_SONGS) {
    const [numerator, denominator] = song.meter;
    const barLength = numerator * 4 / denominator;
    const bars = Map.groupBy(song.notes, ({ bar }) => bar);
    for (const [index, events] of bars) {
      const expected = song.id === "greensleeves" && index === 0 ? 0.5 : barLength;
      assert.equal(events.reduce((total, note) => total + note.beats, 0), expected, song.title);
      for (const event of events) {
        if (event.midi !== null) continue;
        assert.equal(event.beats, 0.5, song.title);
        rests++;
      }
    }
  }
  assert.ok(rests > 0);
});

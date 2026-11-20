import assert from 'node:assert/strict';
import { DRILLS, noteByMidi, NOTES, SCALES, SONGS } from '../js/music.js';

const letterOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ascendingScaleIntervals = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
};

Deno.test('chart covers contiguous chromatic notes and resolves them by MIDI', () => {
  const midiValues = NOTES.map((note) => note.midi).toSorted((a, b) => a - b);
  assert.deepEqual(midiValues, Array.from({ length: 37 }, (_, index) => 60 + index));

  for (const note of NOTES) {
    assert.equal(noteByMidi(note.midi).midi, note.midi);
    assert.ok(Array.isArray(note.keys), `Missing key diagram for MIDI ${note.midi}`);
    assert.equal(new Set(note.keys).size, note.keys.length, `Duplicate fingerings in MIDI ${note.midi}`);
    assert.ok(note.label);
  }
});

Deno.test('scale, drill, and song events agree with their notation and have playable fingerings', () => {
  const items = [...SCALES, ...DRILLS, ...SONGS];
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);

  for (const item of items) {
    assert.ok(item.id && item.title && item.description && item.notes.length);

    for (const note of item.notes) {
      assert.ok(Number.isFinite(note.beats) && note.beats > 0, `${item.title} has an invalid duration`);
      if (note.midi === null) continue; // A rest has no pitch or fingering.

      const spelledMidi = (note.octave + 1) * 12 + letterOffsets[note.letter] + note.accidental;
      assert.equal(note.midi, spelledMidi, `${item.title} contains a misspelled note`);
      assert.ok(noteByMidi(note.midi), `${item.title} contains a note outside the chart`);
    }
  }
});

Deno.test('major and natural minor scales follow their octave intervals and key signatures', () => {
  for (const [kind, ascending] of Object.entries(ascendingScaleIntervals)) {
    const scales = SCALES.filter((scale) => scale.kind === kind);
    assert.equal(new Set(scales.map((scale) => scale.notes[0].midi % 12)).size, 12);
    const expected = [...ascending, ...ascending.slice(0, -1).reverse()];

    for (const scale of scales) {
      const tonic = scale.notes[0].midi;
      assert.deepEqual(scale.notes.map((note) => note.midi - tonic), expected, scale.title);
      assert.ok(
        scale.notes.every((note) => (scale.signature[note.letter] ?? 0) === note.accidental),
        scale.title,
      );
    }
  }
});

Deno.test('repertoire includes the requested pieces and identifies each score', () => {
  assert.ok(SONGS.length > 3);
  assert.ok(SONGS.some((song) => /ode to joy/i.test(song.title)));
  assert.ok(SONGS.some((song) => /clair de lune/i.test(song.title)));
  assert.ok(SONGS.some((song) => /greensleeves/i.test(song.title)));

  for (const song of SONGS) {
    assert.ok(song.composer && song.level && song.source, song.title);
    assert.equal(song.meter.length, 2);
    assert.ok(song.meter.every((value) => Number.isInteger(value) && value > 0));
  }
});

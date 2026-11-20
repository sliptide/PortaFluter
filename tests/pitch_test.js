import assert from 'node:assert/strict';
import { createPitchListener, detectPitch, frequencyForMidi, pitchReading } from '../js/pitch.js';

const toFrequency = (frequency, cents) => frequency * 2 ** (cents / 1200);
const centsBetween = (measured, reference) => 1200 * Math.log2(measured / reference);

function sampleTone(sampleRate, frequency, harmonics = [1], vibratoCents = 0) {
  let phase = 0;
  return Float32Array.from({ length: 4096 }, (_, index) => {
    const time = index / sampleRate;
    const instantCents = vibratoCents * Math.sin(2 * Math.PI * 5 * time);
    phase += 2 * Math.PI * toFrequency(frequency, instantCents) / sampleRate;
    const waveform = harmonics.reduce(
      (sum, level, harmonic) => sum + level * Math.sin((harmonic + 1) * phase),
      0,
    );
    return waveform * 0.25 * (1 + 0.2 * Math.sin(2 * Math.PI * 2 * time));
  });
}

Deno.test('steady notes resolve within three cents at 44.1 and 48 kHz', () => {
  assert.equal(frequencyForMidi(69), 440);

  for (const sampleRate of [44100, 48000]) {
    for (const midi of [60, 69, 84, 96]) {
      const expected = frequencyForMidi(midi);
      const measured = detectPitch(sampleTone(sampleRate, expected), sampleRate);
      assert.ok(measured, `Missing MIDI ${midi} at ${sampleRate} Hz`);
      assert.ok(
        Math.abs(centsBetween(measured.frequency, expected)) <= 3,
        `Expected MIDI ${midi} at ${sampleRate} Hz, received ${measured.frequency} Hz`,
      );
    }
  }
});

Deno.test('a stronger second harmonic and mild vibrato preserve the fundamental octave', () => {
  const sampleRate = 48000;
  const fundamental = frequencyForMidi(72);
  const measured = detectPitch(sampleTone(sampleRate, fundamental, [0.4, 1, 0.25], 7), sampleRate);
  assert.ok(measured);
  assert.ok(Math.abs(centsBetween(measured.frequency, fundamental)) <= 10);
});

Deno.test('tuner cents preserve the flat and sharp sign around a selected note', () => {
  for (const cents of [-25, -10, 0, 10, 25]) {
    const result = pitchReading(toFrequency(440, cents), 69);
    assert.ok(Math.abs(result.cents - cents) <= 1e-6);
    assert.ok(Math.abs(result.targetCents - cents) <= 1e-6);
    assert.equal(result.matchesTarget, true);
  }

  const differentNote = pitchReading(toFrequency(440, 115), 69);
  assert.equal(differentNote.midi, 70);
  assert.ok(Math.abs(differentNote.cents - 15) <= 1e-6);
  assert.ok(Math.abs(differentNote.targetCents - 115) <= 1e-6);
  assert.equal(differentNote.matchesTarget, false);
});

Deno.test('silence and deterministic broadband noise produce no pitch', () => {
  const sampleRate = 48000;
  assert.equal(detectPitch(new Float32Array(4096), sampleRate), null);

  let state = 42;
  const noise = Float32Array.from({ length: 4096 }, () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return 0.3 * (state / 2 ** 31 - 1);
  });
  assert.equal(detectPitch(noise, sampleRate), null);
});

Deno.test('a microphone stream granted after cancel is stopped immediately', async () => {
  const statuses = [];
  let contextClosed = false;
  let trackStopped = false;
  let resolveStream;
  const streamPromise = new Promise((resolve) => {
    resolveStream = resolve;
  });

  class FakeAudioContext {
    async resume() {}

    async close() {
      contextClosed = true;
    }
  }

  const fakeBrowserGlobals = {
    window: { isSecureContext: true, AudioContext: FakeAudioContext },
    navigator: { mediaDevices: { getUserMedia: () => streamPromise } },
    cancelAnimationFrame() {},
  };
  const originals = new Map();
  try {
    for (const [name, value] of Object.entries(fakeBrowserGlobals)) {
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, value });
    }

    const listener = createPitchListener({ onStatus: (status) => statuses.push(status), onPitch() {} });
    const started = listener.start();
    listener.stop();
    resolveStream({
      getTracks: () => [{
        stop: () => {
          trackStopped = true;
        },
      }],
    });
    await started;

    assert.deepEqual(statuses, ['requesting', 'idle']);
    assert.equal(contextClosed, true);
    assert.equal(trackStopped, true);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

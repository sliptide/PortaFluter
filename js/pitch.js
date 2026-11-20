const MIN_FREQUENCY = 190;
const MAX_FREQUENCY = 2500;

export function frequencyForMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchReading(frequency, targetMidi) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exactMidi);
  return {
    midi,
    cents: (exactMidi - midi) * 100,
    targetCents: Number.isInteger(targetMidi) ? (exactMidi - targetMidi) * 100 : null,
    matchesTarget: midi === targetMidi,
  };
}

export function detectPitch(samples, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < MAX_FREQUENCY * 2) return null;

  // Downsample with a short averaging filter to keep the per-frame work small.
  const stride = Math.max(1, Math.floor(sampleRate / 24000));
  const rate = sampleRate / stride;
  const size = Math.floor(samples.length / stride);
  const first = Math.max(2, Math.floor(rate / MAX_FREQUENCY));
  const last = Math.ceil(rate / MIN_FREQUENCY);
  if (size < last * 3) return null;

  const signal = new Float32Array(size);
  let mean = 0;
  for (let i = 0; i < size; i++) {
    let sum = 0;
    for (let j = 0; j < stride; j++) sum += samples[i * stride + j];
    signal[i] = sum / stride;
    mean += signal[i];
  }
  mean /= size;

  let energy = 0;
  for (let i = 0; i < size; i++) {
    signal[i] -= mean;
    energy += signal[i] ** 2;
  }
  if (!Number.isFinite(energy) || Math.sqrt(energy / size) < 0.003) return null;

  // McLeod's normalized square difference compares a frame with its delayed copy.
  const curve = new Float32Array(last + 2);
  for (let lag = first - 1; lag <= last + 1; lag++) {
    let product = 0;
    let power = 0;
    for (let i = 0; i < size - lag; i++) {
      const a = signal[i];
      const b = signal[i + lag];
      product += a * b;
      power += a * a + b * b;
    }
    curve[lag] = power > 0 ? (2 * product) / power : 0;
  }

  const peaks = [];
  for (let lag = first; lag <= last; lag++) {
    const a = curve[lag - 1];
    const b = curve[lag];
    const c = curve[lag + 1];
    if (b <= 0 || b <= a || b < c) continue;
    const shift = (a - c) / (2 * (a - 2 * b + c));
    peaks.push({ lag: lag + shift, clarity: Math.min(1, b - 0.25 * (a - c) * shift) });
  }

  const highest = peaks.reduce((best, peak) => Math.max(best, peak.clarity), 0);
  const peak = peaks.find((candidate) => candidate.clarity >= Math.max(0.84, highest * 0.94));
  if (!peak) return null;

  const frequency = rate / peak.lag;
  return frequency >= MIN_FREQUENCY && frequency <= MAX_FREQUENCY
    ? { frequency, clarity: peak.clarity }
    : null;
}

export function createPitchListener({ onStatus, onPitch }) {
  let active = null;

  function release(session) {
    cancelAnimationFrame(session.frame);
    session.stream?.getTracks().forEach((track) => track.stop());
    session.source?.disconnect();
    session.analyser?.disconnect();
    if (session.context && session.context.state !== "closed") {
      session.context.close().catch(() => {});
    }
  }

  function stop(status = "idle") {
    if (active) {
      const session = active;
      active = null;
      release(session);
    }
    onPitch(null);
    onStatus(status);
  }

  async function start() {
    if (active) return;
    if (!window.isSecureContext) {
      onStatus("insecure");
      return;
    }
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio || !navigator.mediaDevices?.getUserMedia) {
      onStatus("unavailable");
      return;
    }

    const session = { frame: 0, context: null };
    active = session;
    onStatus("requesting");

    try {
      const context = new Audio();
      session.context = context;
      const resumed = context.resume().then(() => true, () => false);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (active !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      session.stream = stream;
      if (!(await resumed)) throw new Error("Audio unavailable");
      if (active !== session) return;

      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      session.analyser = analyser;
      session.source = context.createMediaStreamSource(stream);
      session.source.connect(analyser); // No connection to the speakers.

      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (active === session) stop("interrupted");
        }, { once: true });
      }
      context.addEventListener("statechange", () => {
        if (active === session && context.state !== "running") stop("interrupted");
      });

      const waveform = new Float32Array(analyser.fftSize);
      let lastFrame = -Infinity;
      let history = [];
      let lastMidi = null;
      function readFrame(time) {
        if (active !== session) return;
        if (time - lastFrame >= 55) {
          lastFrame = time;
          analyser.getFloatTimeDomainData(waveform);
          const result = detectPitch(waveform, context.sampleRate);
          if (result) {
            const { midi } = pitchReading(result.frequency);
            if (midi !== lastMidi) history = [];
            lastMidi = midi;
            history.push(result.frequency);
            if (history.length > 5) history.shift();
            const sorted = [...history].sort((a, b) => a - b);
            onPitch(sorted[Math.floor(sorted.length / 2)]);
          } else {
            history = [];
            lastMidi = null;
            onPitch(null);
          }
        }
        session.frame = requestAnimationFrame(readFrame);
      }

      onStatus("listening");
      session.frame = requestAnimationFrame(readFrame);
    } catch (error) {
      if (active !== session) return;
      const denied = error.name === "NotAllowedError" || error.name === "SecurityError";
      stop(denied ? "denied" : "unavailable");
    }
  }

  return { start, stop };
}

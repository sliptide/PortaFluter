const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

// Standard Boehm concert flute with a C foot. T is the B-natural thumb lever.
// Basic fingerings cross-checked with the Woodwind Fingering Guide:
// https://www.wfg.woodwind.org/flute/ (basic chart, first through third octave).
const FINGERINGS = [
  "T L1 L2 L3 R1 R2 R3 C",      // C4
  "T L1 L2 L3 R1 R2 R3 C#",     // C♯4
  "T L1 L2 L3 R1 R2 R3",        // D4
  "T L1 L2 L3 R1 R2 R3 Eb",     // E♭4
  "T L1 L2 L3 R1 R2 Eb",        // E4
  "T L1 L2 L3 R1 Eb",           // F4
  "T L1 L2 L3 R3 Eb",           // F♯4
  "T L1 L2 L3 Eb",              // G4
  "T L1 L2 L3 G# Eb",           // A♭4
  "T L1 L2 Eb",                 // A4
  "T L1 R1 Eb",                 // B♭4
  "T L1 Eb",                    // B4
  "L1 Eb",                      // C5
  "Eb",                         // C♯5
  "T L2 L3 R1 R2 R3",           // D5
  "T L2 L3 R1 R2 R3 Eb",        // E♭5
  "T L1 L2 L3 R1 R2 Eb",        // E5
  "T L1 L2 L3 R1 Eb",           // F5
  "T L1 L2 L3 R3 Eb",           // F♯5
  "T L1 L2 L3 Eb",              // G5
  "T L1 L2 L3 G# Eb",           // A♭5
  "T L1 L2 Eb",                 // A5
  "T L1 R1 Eb",                 // B♭5
  "T L1 Eb",                    // B5
  "L1 Eb",                      // C6
  "Eb",                         // C♯6
  "T L2 L3 Eb",                 // D6
  "T L1 L2 L3 G# R1 R2 R3 Eb",  // E♭6
  "T L1 L2 R1 R2 Eb",           // E6
  "T L1 L3 R1 Eb",              // F6
  "T L1 L3 R3 Eb",              // F♯6
  "L1 L2 L3 Eb",                // G6
  "L2 L3 G# Eb",                // A♭6
  "T L2 R1 Eb",                 // A6
  "T R1 D-trill",               // B♭6
  "T L1 L3 D#-trill",           // B6
  "L1 L2 L3 G# R1",             // C7
];

export const NOTES = FINGERINGS.map((fingering, index) => {
  const midi = 60 + index;
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  return { midi, name, octave, label: name + octave, keys: fingering.split(" ") };
});

export function noteByMidi(midi) {
  return NOTES[midi - 60];
}

const ACCIDENTALS = { "#": 1, "♯": 1, b: -1, "♭": -1 };
const SIGNS = { "-1": "♭", 0: "", 1: "♯" };

function parseNote(token) {
  const [pitch, duration = "1"] = token.split(":");
  const [, letter, sign, register] = /^([A-G])([#b♯♭]?)([4-7])$/.exec(pitch);
  const octave = Number(register);
  const accidental = ACCIDENTALS[sign] ?? 0;
  const midi = (octave + 1) * 12 + NATURAL_PITCHES[LETTERS.indexOf(letter)] + accidental;

  return { midi, letter, accidental, octave, beats: Number(duration), label: letter + SIGNS[accidental] + octave };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12];

function makeScale(tonic, kind) {
  const root = parseNote(tonic + "4");
  const firstLetter = LETTERS.indexOf(root.letter);
  const intervals = kind === "major" ? MAJOR : MINOR;
  const ascending = intervals.map((interval, degree) => {
    const letterIndex = (firstLetter + degree) % LETTERS.length;
    const letter = LETTERS[letterIndex];
    const octave = 4 + Math.floor((firstLetter + degree) / LETTERS.length);
    const naturalMidi = (octave + 1) * 12 + NATURAL_PITCHES[letterIndex];
    const midi = root.midi + interval;
    const accidental = midi - naturalMidi;

    return { midi, letter, accidental, octave, beats: 1, label: letter + SIGNS[accidental] + octave };
  });

  const key = root.letter + SIGNS[root.accidental];
  const slug = tonic.toLowerCase().replace("#", "-sharp").replace(/(.)b$/, "$1-flat");
  const notes = [...ascending, ...ascending.slice(0, -1).reverse()];
  const signature = Object.fromEntries(ascending.slice(0, -1).map(note => [note.letter, note.accidental]));
  return {
    id: slug + "-" + kind,
    title: key + " " + (kind === "minor" ? "natural minor" : kind),
    key,
    kind,
    signature,
    description: "One octave ascending and descending.",
    notes,
  };
}

export const SCALES = [
  ...["C", "G", "F", "D", "Bb", "A", "Eb", "E", "Ab", "B", "Db", "F#"].map(tonic => makeScale(tonic, "major")),
  ...["A", "D", "E", "G", "B", "C", "F#", "F", "C#", "Bb", "G#", "Eb"].map(tonic => makeScale(tonic, "minor")),
];

function drill(id, title, description, pitches) {
  return { id, title, description, kind: "drill", notes: pitches.split(" ").map(parseNote) };
}

export const DRILLS = [
  drill("first-five", "First Five Notes", "Move between five neighboring notes in the lower register.", "G4 A4 B4 C5 D5 C5 B4 A4 G4"),
  drill("register-crossing", "Register Crossings", "Alternate lower notes with their counterparts an octave higher.", "D4 D5 E4 E5 F4 F5 G4 G5"),
  drill("chromatic-steps", "Chromatic Steps", "Practice neighboring semitones and alternate finger patterns.", "F4 F#4 G4 Ab4 A4 Bb4 B4 C5"),
  drill("upper-register", "Upper Register", "Practice transitions through the third octave.", "D6 E6 F6 G6 A6 Bb6 B6 C7"),
];

function song(metadata, measures) {
  const length = metadata.meter[0] * 4 / metadata.meter[1];
  const scoredMeasures = measures.trim().split("|").map(measure => measure.trim().split(/\s+/).map(parseNote));

  const notes = scoredMeasures.flatMap((measure, bar) => {
    const total = measure.reduce((sum, note) => sum + note.beats, 0);
    const isInterior = bar > 0 && bar < scoredMeasures.length - 1;
    if (total > length || (isInterior && total !== length)) {
      throw new Error(metadata.title + " has an incorrect duration in measure " + (bar + 1));
    }
    return measure.map(note => ({ ...note, bar }));
  });

  return { ...metadata, kind: "song", notes };
}

export const SONGS = [
  song({
    id: "ode-to-joy", title: "Ode to Joy", composer: "Ludwig van Beethoven", level: "Easy",
    description: "The theme from Symphony No. 9, transposed to G major for solo flute.",
    source: "https://www.loc.gov/item/2021668114/", meter: [4, 4], signature: { F: 1 },
  }, `
    B4 B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | B4:1.5 A4:0.5 A4:2 |
    B4 B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | A4:1.5 G4:0.5 G4:2 |
    A4 A4 B4 G4 | A4 B4:0.5 C5:0.5 B4 G4 | A4 B4:0.5 C5:0.5 B4 A4 | G4 A4 D4:2 |
    B4 B4 C5 D5 | D5 C5 B4 A4 | G4 G4 A4 B4 | A4:1.5 G4:0.5 G4:2
  `),
  song({
    id: "greensleeves", title: "Greensleeves", composer: "Traditional English", level: "Intermediate",
    description: "A solo setting of the traditional melody in A minor with a lilting compound meter.",
    source: "https://urresearch.rochester.edu/institutionalPublicationPublicView.action?institutionalItemVersionId=17175",
    meter: [6, 8], signature: {},
  }, `
    A4:0.5 |
    C5:1 D5:0.5 E5:0.75 F5:0.25 E5:0.5 | D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5 |
    C5:1 A4:0.5 A4:0.75 G#4:0.25 A4:0.5 | B4:1 G#4:0.5 E4:1 A4:0.5 |
    C5:1 D5:0.5 E5:0.75 F5:0.25 E5:0.5 | D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5 |
    C5:0.75 B4:0.25 A4:0.5 G#4:0.75 F#4:0.25 G#4:0.5 | A4:1.5 A4:1.5 |
    G5:1.5 G5:0.75 F#5:0.25 E5:0.5 | D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5 |
    C5:1 A4:0.5 A4:0.75 G#4:0.25 A4:0.5 | B4:1 G#4:0.5 E4:1.5 |
    G5:1.5 G5:0.75 F#5:0.25 E5:0.5 | D5:1 B4:0.5 G4:0.75 A4:0.25 B4:0.5 |
    C5:0.75 B4:0.25 A4:0.5 G#4:0.75 F#4:0.25 G#4:0.5 | A4:3
  `),
  song({
    id: "clair-de-lune", title: "Clair de lune", composer: "Claude Debussy", level: "Intermediate",
    description: "A simplified solo flute adaptation of the opening eight measures, transposed to E♭ major.",
    source: "https://urresearch.rochester.edu/institutionalPublicationPublicView.action?institutionalItemId=11883&versionNumber=1",
    meter: [9, 8], signature: { B: -1, E: -1, A: -1 },
  }, `
    Bb4 Bb5:2 G5:1.5 | G5:0.5 F5:0.5 G5:0.5 F5:3 |
    F5:0.5 Eb5:0.5 F5:0.5 G5:1.5 Eb5:1.5 | Eb5:0.5 D5:0.5 Eb5:0.5 D5:3 |
    D5:0.5 C5:0.5 D5:0.5 C5:0.5 F5:0.5 C5:0.5 Bb4:0.5 C5:0.5 Bb4:0.5 |
    Bb4:0.5 Ab4:0.5 Bb4:0.5 Ab4:1.5 G4:1.5 |
    G4:0.5 G4:0.5 Ab4:0.5 G4:0.5 C5:0.5 G4:0.5 F4:0.5 G4:0.5 F4:0.5 |
    F4:0.5 Eb4:0.5 F4:0.5 Eb4:1.5 D4:1.5
  `),
  song({
    id: "amazing-grace", title: "Amazing Grace", composer: "Traditional American", level: "Easy",
    description: "The New Britain melody in G major, with a pickup and a steady three-beat pulse.",
    source: "https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/",
    meter: [3, 4], signature: { F: 1 },
  }, `
    D4 |
    G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 |
    G4:2 B4:0.5 G4:0.5 | B4:2 A4 | D5:3 | D5:2 B4 |
    D5:1.5 B4:0.5 D5:0.5 B4:0.5 | G4:2 D4 | E4:1.5 G4:0.5 G4:0.5 E4:0.5 | D4:2 D4 |
    G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:3
  `),
  song({
    id: "twinkle", title: "Twinkle, Twinkle, Little Star", composer: "Traditional French", level: "Easy",
    description: "A simple solo setting of the familiar six-note tune in F major.",
    source: "https://dme.mozarteum.at/DME/objs/pdf/nma_199_49_57.pdf",
    meter: [4, 4], signature: { B: -1 },
  }, `
    F4 F4 C5 C5 | D5 D5 C5:2 | Bb4 Bb4 A4 A4 | G4 G4 F4:2 |
    C5 C5 Bb4 Bb4 | A4 A4 G4:2 | C5 C5 Bb4 Bb4 | A4 A4 G4:2 |
    F4 F4 C5 C5 | D5 D5 C5:2 | Bb4 Bb4 A4 A4 | G4 G4 F4:2
  `),
];

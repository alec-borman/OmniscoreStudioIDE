
export type Pitch = string; // e.g., "c4", "eb5", "c5-15"

export interface AutomationCurve {
  cc: number;
  values: number | [number, number]; // Static value or [start, end] ramp
}

export interface NoteEvent {
  pitches: Pitch[];
  duration: number; // In beats
  velocity: number; // 0-1
  isRest: boolean;
  modifiers: string[];
  startTime: number; // Absolute beat position
  staffId: string;
  detune: number; // In cents
  
  // V4 Attributes
  cc: AutomationCurve[];
  color?: string;
  head?: string;
  
  // V4.1 Source Mapping
  sourceLine: number;
}

export interface Macro {
  name: string;
  content: string;
}

export interface OmniScore {
  title: string;
  composer: string;
  tempo: number;
  timeSignature: [number, number];
  staves: StaffDefinition[];
  events: NoteEvent[];
  macros: Record<string, string>;
  totalBeats: number;
  meta: Record<string, any>;
}

export interface StaffDefinition {
  id: string;
  label: string;
  style: 'standard' | 'tab' | 'grid';
  clef: string;
  patch: string;
  pan: number; // -100 to 100
  vol: number; // 0-127
  transpose: number; // Semitones
  keyswitches: Record<string, number>; // Name -> MIDI Note (Logic mapping)
}

export enum TransportState {
  STOPPED = 'STOPPED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED'
}

export interface ThermodynamicState {
  wobble: number; // 0-1 (The Dirt)
  entropy: number; // 0-100 (Surprise)
  heat: number; // 0-100 (Cognitive Effort)
}


import { NoteEvent, OmniScore, StaffDefinition } from './types';

const getMidiNote = (note: string): number => {
  const notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const regex = /^([a-g])([#b]*)(-?\d+)$/;
  const match = note.toLowerCase().match(regex);
  if (!match) return 60;
  let [_, step, acc, oct] = match;
  let semitoneOffset = notes.indexOf(step);
  if (acc === '#') semitoneOffset += 1;
  if (acc === 'b') semitoneOffset -= 1;
  return 12 + (parseInt(oct) * 12) + semitoneOffset;
}

export class PianoSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private isPlaying: boolean = false;
  private currentScore: OmniScore | null = null;
  private nextNoteIndex: number = 0;
  private startTimestamp: number = 0;
  private transportTime: number = 0;
  private timerID: number | null = null;
  private baseFreq: number = 440;
  
  // Thermodynamic Properties
  private wobbleFactor: number = 0;

  constructor() {}

  public async init() {
    if (this.ctx) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        return;
    }
    
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.compressor = this.ctx.createDynamicsCompressor();
    this.reverb = this.ctx.createConvolver();
    this.createReverbImpulse();

    this.masterGain.connect(this.compressor);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.3;

    this.compressor.connect(this.ctx.destination);
    this.compressor.connect(reverbGain);
    reverbGain.connect(this.reverb);
    this.reverb.connect(this.ctx.destination);
  }

  private createReverbImpulse() {
    if (!this.ctx || !this.reverb) return;
    const duration = 3.5;
    const length = this.ctx.sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
        const channel = impulse.getChannelData(i);
        for (let j = 0; j < length; j++) {
            channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, 3);
        }
    }
    this.reverb.buffer = impulse;
  }

  public setWobble(amount: number) {
      this.wobbleFactor = amount;
  }

  public play(score: OmniScore, metronome: boolean) {
    if (!this.ctx) this.init();
    
    this.currentScore = score;
    this.isPlaying = true;
    
    const tuningStr = score.meta?.tuning || "440Hz";
    this.baseFreq = parseInt(tuningStr.replace("Hz", "")) || 440;

    // Reset loop index if starting fresh
    if (this.transportTime === 0) {
        this.nextNoteIndex = 0;
        this.startTimestamp = this.ctx!.currentTime;
    } else {
        this.startTimestamp = this.ctx!.currentTime - this.transportTime;
    }

    this.schedulerLoop();
  }

  public pause() {
    this.isPlaying = false;
    if (this.timerID !== null) window.clearTimeout(this.timerID);
    if (this.ctx) {
        this.transportTime = this.ctx.currentTime - this.startTimestamp;
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerID !== null) window.clearTimeout(this.timerID);
    this.transportTime = 0;
    this.nextNoteIndex = 0;
  }

  public setTransportPosition(beat: number, score: OmniScore) {
      if (!this.ctx) return;
      const secondsPerBeat = 60 / score.tempo;
      const newTime = beat * secondsPerBeat;
      this.transportTime = newTime;
      this.startTimestamp = this.ctx.currentTime - newTime;
      this.nextNoteIndex = 0;
      
      // Fast forward to correct index
      while (
          this.nextNoteIndex < score.events.length && 
          (score.events[this.nextNoteIndex].startTime * secondsPerBeat) < newTime
      ) {
          this.nextNoteIndex++;
      }
  }

  public getCurrentBeat(score: OmniScore): number {
      if (!this.ctx || !this.isPlaying) {
          if (!score) return 0;
          return this.transportTime / (60 / score.tempo);
      }
      const now = this.ctx.currentTime;
      const songTime = now - this.startTimestamp;
      return songTime / (60 / score.tempo);
  }

  private schedulerLoop() {
      if (!this.isPlaying || !this.ctx || !this.currentScore) return;

      try {
          const secondsPerBeat = 60 / this.currentScore.tempo;
          const currentSongTime = this.ctx.currentTime - this.startTimestamp;
          // Increased lookahead to 0.25s to prevent "stopping halfway" due to JS throttling
          const scheduleUntil = currentSongTime + 0.25; 

          while (
              this.nextNoteIndex < this.currentScore.events.length &&
              (this.currentScore.events[this.nextNoteIndex].startTime * secondsPerBeat) < scheduleUntil
          ) {
              const ev = this.currentScore.events[this.nextNoteIndex];
              const playTimeAbs = this.startTimestamp + (ev.startTime * secondsPerBeat);
              
              // Only play if we haven't missed it by too much (0.1s tolerance)
              if (playTimeAbs >= this.ctx.currentTime - 0.1) {
                  this.playEvent(ev, playTimeAbs, secondsPerBeat);
              }
              this.nextNoteIndex++;
          }
      } catch (e) {
          console.error("Ω-ENGINE: Entropy spike detected in scheduler.", e);
      }

      this.timerID = window.setTimeout(() => this.schedulerLoop(), 30);
  }

  private playEvent(ev: NoteEvent, time: number, secondsPerBeat: number) {
      if (ev.isRest) return;
      
      const durationSec = ev.duration * secondsPerBeat;
      const staff = this.currentScore?.staves.find(s => s.id === ev.staffId);
      const patch = staff?.patch || "Grand Piano";
      const basePan = staff?.pan || 0;
      const baseVol = (staff?.vol || 100) / 100;
      const transpose = staff?.transpose || 0;

      // --- WOBBLE LOGIC (The Dirt) ---
      // Time drift: +/- wobble * 50ms
      const timeDrift = (Math.random() - 0.5) * 0.1 * this.wobbleFactor;
      const finalTime = time + timeDrift;

      if (staff?.style === 'grid') {
          const key = ev.pitches[0]; 
          this.playDrum(key, finalTime, ev.velocity * baseVol, ev.modifiers);
          return;
      }

      let playDuration = durationSec;
      if (ev.modifiers.includes('stacc')) playDuration *= 0.4;
      if (ev.modifiers.includes('ten')) playDuration *= 1.2;

      let activeKeyswitch = 'normal';
      if (staff?.keyswitches) {
          for (const k of Object.keys(staff.keyswitches)) {
              if (ev.modifiers.includes(k)) {
                  activeKeyswitch = k;
                  break;
              }
          }
      }

      const isArp = ev.modifiers.includes('arp');
      
      ev.pitches.forEach((pitch, index) => {
          let noteTime = finalTime;
          if (isArp) {
              // Arp speed also affected by wobble
              const arpJitter = (Math.random() - 0.5) * 0.02 * this.wobbleFactor;
              noteTime += (index * (0.04 + arpJitter));
          }
          
          this.playSynthesizedNote(
              pitch, noteTime, playDuration, ev.velocity * baseVol, 
              ev.detune, patch, basePan, ev.modifiers, 
              ev.cc, transpose, activeKeyswitch
          );
      });
  }

  private playDrum(key: string, time: number, velocity: number, mods: string[]) {
      if (!this.ctx || !this.masterGain) return;
      // Drum wobble affects pitch slightly
      const drumDetune = (Math.random() - 0.5) * 200 * this.wobbleFactor; 
      
      const isRoll = mods.includes('roll');
      const isGhost = mods.includes('ghost');
      const vol = isGhost ? velocity * 0.4 : velocity;

      const trigger = (t: number, v: number) => {
          if (!this.ctx || !this.masterGain) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const noise = this.ctx.createBufferSource();
          
          gain.connect(this.masterGain!);

          if (key === 'k' || key === 'kick') { 
              osc.frequency.setValueAtTime(150 + drumDetune, t);
              osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
              gain.gain.setValueAtTime(v, t);
              gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
              osc.connect(gain);
              osc.start(t);
              osc.stop(t + 0.5);
          }
          else if (key === 's' || key === 'rim') { 
              const bufferSize = this.ctx.sampleRate * 0.2;
              const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
              const data = buffer.getChannelData(0);
              for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
              noise.buffer = buffer;
              const filter = this.ctx.createBiquadFilter();
              
              if (key === 'rim') {
                 filter.type = 'bandpass';
                 filter.frequency.value = 2000 + drumDetune;
                 filter.Q.value = 5;
                 gain.gain.setValueAtTime(v * 0.6, t);
                 gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
                 noise.stop(t + 0.05);
              } else {
                 filter.type = 'highpass';
                 filter.frequency.value = 1000 + drumDetune;
                 gain.gain.setValueAtTime(v * 0.8, t);
                 gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                 noise.stop(t + 0.2);
              }

              noise.connect(filter);
              filter.connect(gain);
              noise.start(t);
          }
          else { 
             const bufferSize = this.ctx.sampleRate * 0.05;
             const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
             const data = buffer.getChannelData(0);
             for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() > 0.5 ? 1 : -1);
             noise.buffer = buffer;
             noise.connect(gain);
             gain.gain.setValueAtTime(v * 0.5, t);
             noise.start(t);
             noise.stop(t + 0.05);
          }
      };

      if (isRoll) {
          for(let i=0; i<8; i++) {
              trigger(time + (i * 0.03), vol * 0.6);
          }
      } else {
          trigger(time, vol);
      }
  }

  private playSynthesizedNote(
      pitch: string, 
      time: number, 
      duration: number, 
      velocity: number, 
      detuneCents: number,
      patch: string,
      pan: number,
      mods: string[],
      cc: any[],
      transpose: number,
      keyswitchMode: string
  ) {
      if (!this.ctx || !this.masterGain) return;

      const rawMidi = getMidiNote(pitch);
      const transposedMidi = rawMidi + transpose;
      const freq = this.baseFreq * Math.pow(2, (transposedMidi - 69) / 12);
      
      // Pitch Wobble (Analog Drift)
      const pitchWobble = (Math.random() - 0.5) * 50 * this.wobbleFactor; // +/- 25 cents max
      const finalDetune = detuneCents + pitchWobble;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan / 100));
      panner.connect(this.masterGain);

      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      
      filter.connect(gain);
      gain.connect(panner);

      // --- KEYSWITCH / ARTICULATION ---
      let vibratoDepth = 0;
      let vibratoRate = 5;
      let attackTime = 0.01;
      let oscType: OscillatorType = 'triangle';
      let noiseMix = 0;

      if (keyswitchMode === 'suffering') {
          vibratoDepth = 20;
          vibratoRate = 6;
          oscType = 'sawtooth';
      } else if (keyswitchMode === 'transcendence') {
          vibratoDepth = 5;
          vibratoRate = 4;
          attackTime = 0.5;
          oscType = 'sawtooth';
      } else if (keyswitchMode === 'flautando') {
          oscType = 'sine'; 
          attackTime = 0.1;
          noiseMix = 0.1; 
      } else if (keyswitchMode === 'scratch') {
          oscType = 'sawtooth';
          noiseMix = 0.4;
          filter.type = 'highpass'; 
          filter.frequency.value = 1000;
      }

      if (patch.includes('Piano')) {
          oscType = 'triangle'; 
          filter.type = 'lowpass';
          filter.frequency.value = 2000;
          attackTime = 0.01;
      }

      const now = time;
      const end = time + duration;

      const cc11 = cc.find((c: any) => c.cc === 11);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(velocity * 0.5, now + attackTime);
      
      if (cc11) {
          const startVal = Array.isArray(cc11.values) ? cc11.values[0] : cc11.values;
          const endVal = Array.isArray(cc11.values) ? cc11.values[1] : cc11.values;
          gain.gain.setValueAtTime((startVal / 127) * velocity, now + attackTime);
          gain.gain.linearRampToValueAtTime((endVal / 127) * velocity, end);
      } else {
          gain.gain.setValueAtTime(velocity * 0.5, end - 0.1);
      }
      gain.gain.linearRampToValueAtTime(0, end + 0.2);

      const osc = this.ctx.createOscillator();
      osc.type = oscType;
      osc.frequency.value = freq;
      osc.detune.value = finalDetune;
      
      if ((patch.includes('String') || patch.includes('Friction')) && !keyswitchMode.match(/flautando|scratch/)) {
          osc.type = 'sawtooth';
          filter.type = 'lowpass';
          filter.frequency.value = 2000;
      }

      if (vibratoDepth > 0) {
          const lfo = this.ctx.createOscillator();
          lfo.frequency.value = vibratoRate;
          const lfoGain = this.ctx.createGain();
          lfoGain.gain.value = vibratoDepth;
          lfo.connect(osc.detune);
          lfo.start(now);
          lfo.stop(end + 0.2);
      }

      if (noiseMix > 0) {
          const noise = this.ctx.createBufferSource();
          const bufferSize = this.ctx.sampleRate * 2;
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
          noise.buffer = buffer;
          const noiseGain = this.ctx.createGain();
          noiseGain.gain.value = noiseMix;
          noise.connect(noiseGain);
          noiseGain.connect(filter);
          noise.start(now);
          noise.stop(end + 0.2);
      }
      
      const cc1 = cc.find((c: any) => c.cc === 1);
      if (cc1) {
          const startVal = Array.isArray(cc1.values) ? cc1.values[0] : cc1.values;
          const endVal = Array.isArray(cc1.values) ? cc1.values[1] : cc1.values;
          const mapFreq = (v: number) => 200 + (v/127 * 4800);
          filter.frequency.setValueAtTime(mapFreq(startVal), now);
          filter.frequency.linearRampToValueAtTime(mapFreq(endVal), end);
      }

      osc.connect(filter);
      osc.start(now);
      osc.stop(end + 0.2);

      setTimeout(() => {
          gain.disconnect();
          panner.disconnect();
      }, (end + 0.5 - this.ctx.currentTime + 1) * 1000);
  }
}

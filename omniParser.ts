
import { OmniScore, NoteEvent, Pitch, StaffDefinition, AutomationCurve } from './types';

export class OmniCompiler {
  private lastDurations: Record<string, number> = {};
  private lastOctaves: Record<string, number> = {};
  private macros: Record<string, string> = {};
  private staves: StaffDefinition[] = [];
  private currentTime: number = 0;
  private tempo: number = 60;
  private timeSignature: [number, number] = [4, 4];
  private globalMeta: Record<string, any> = {};

  // Pitch Math
  private notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

  public compile(code: string): OmniScore {
    this.reset();
    const cleanCode = this.preprocess(code);
    
    // Phase 1: Context
    this.extractMacros(cleanCode);
    this.extractDefinitions(cleanCode);
    this.extractGlobalMeta(cleanCode);

    const events: NoteEvent[] = [];
    
    // Phase 2: Linearization with Line Mapping
    const measureBlockRegex = /measure\s+([\d-]+)([\s\S]*?)(?=measure\s+|$)/gi;
    let match;

    while ((match = measureBlockRegex.exec(cleanCode)) !== null) {
      const rangeStr = match[1];
      const blockContent = match[2];
      const matchIndex = match.index;
      
      // Calculate start line of this block match
      // We look at the substring before the match to count newlines
      const preMatch = cleanCode.substring(0, matchIndex);
      const startLine = preMatch.split('\n').length - 1;

      const [start, end] = rangeStr.includes('-') 
        ? rangeStr.split('-').map(Number)
        : [parseInt(rangeStr), parseInt(rangeStr)];
      
      const loopCount = (end - start) + 1;
      
      // Parse block, passing the base line number
      const blockEvents = this.parseMeasureBlock(blockContent, startLine);
      
      const beatsPerMeasure = this.timeSignature[0] * (4 / this.timeSignature[1]);
      
      for (let i = 0; i < loopCount; i++) {
         blockEvents.forEach(ev => {
             events.push({
                 ...ev,
                 startTime: ev.startTime + this.currentTime
             });
         });
         this.currentTime += beatsPerMeasure;
      }
    }

    const sortedEvents = events.sort((a, b) => a.startTime - b.startTime);
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    const totalBeats = lastEvent ? lastEvent.startTime + lastEvent.duration + 4 : 0;

    return {
      title: this.globalMeta.title || "OmniScore Piece",
      composer: this.globalMeta.composer || "AI",
      tempo: this.tempo,
      timeSignature: this.timeSignature,
      staves: this.staves,
      events: sortedEvents,
      macros: this.macros,
      totalBeats,
      meta: this.globalMeta
    };
  }

  private reset() {
    this.lastDurations = {};
    this.lastOctaves = {};
    this.macros = {};
    this.staves = [];
    this.currentTime = 0;
    this.tempo = 60;
    this.timeSignature = [4, 4];
    this.globalMeta = {};
  }

  private preprocess(code: string): string {
      // NOTE: We used to strip comments here.
      // To maintain strict line mapping for the UI, we must preserve newlines.
      // We will replace comment content with spaces, but keep the structure?
      // Or we just allow the regex to handle it. 
      // Current regex logic splits by lines anyway. 
      // If we remove comments via replace, we risk shifting chars but if we replace with '', newlines remain?
      // `replace(/%%.*/g, '')` leaves the `\n` because `.` doesn't match `\n`.
      // So line counts are preserved.
      let clean = code.replace(/%%.*/g, '');
      // Handle the 'if' block structural removal
      clean = clean.replace(/if\s*\([^)]+\)\s*\{/g, (m) => ' '.repeat(m.length)); 
      clean = clean.replace(/\}/g, ' '); 
      return clean;
  }

  private extractMacros(code: string) {
    const macroRegex = /macro\s+(\$[\w]+)\s*=\s*\{([^}]+)\}/gs;
    let match;
    while ((match = macroRegex.exec(code)) !== null) {
      const key = match[1]; 
      this.macros[key] = match[2].replace(/\n/g, ' ').trim();
    }
  }

  private extractDefinitions(code: string) {
    const defRegex = /def\s+(\w+)\s+"([^"]+)"\s*(.*)/g;
    let match;
    while ((match = defRegex.exec(code)) !== null) {
      const attrs = match[3];
      const styleMatch = attrs.match(/style=(\w+)/);
      const clefMatch = attrs.match(/clef=(\w+)/);
      const patchMatch = attrs.match(/patch="([^"]+)"/);
      const panMatch = attrs.match(/pan=(-?\d+)/);
      const volMatch = attrs.match(/vol=(\d+)/);
      const transMatch = attrs.match(/transpose=([+\-]?\d+)/);
      const keyswitchMatch = attrs.match(/keyswitch=\{([^}]+)\}/);
      const keyswitches: Record<string, number> = {};
      if (keyswitchMatch) {
          keyswitchMatch[1].split(',').forEach(pair => {
              const [k, v] = pair.split(':').map(s => s.trim());
              keyswitches[k] = parseInt(v);
          });
      }

      this.staves.push({
        id: match[1],
        label: match[2],
        style: (styleMatch ? styleMatch[1] : 'standard') as any,
        clef: clefMatch ? clefMatch[1] : 'treble',
        patch: patchMatch ? patchMatch[1] : 'Grand Piano',
        pan: panMatch ? parseInt(panMatch[1]) : 0,
        vol: volMatch ? parseInt(volMatch[1]) : 100,
        transpose: transMatch ? parseInt(transMatch[1]) : 0,
        keyswitches
      });
    }
  }

  private extractGlobalMeta(code: string) {
    const metaRegex = /meta\s*\{([^}]+)\}/;
    const match = metaRegex.exec(code);
    if (match) {
        this.parseMetaString(match[1]);
    }
  }

  private parseMeasureBlock(block: string, startLine: number): NoteEvent[] {
      const events: NoteEvent[] = [];
      const metaMatch = block.match(/meta\s*\{([^}]+)\}/);
      if (metaMatch) {
          this.parseMetaString(metaMatch[1]);
      }

      // We must split by newline to track lines
      const lines = block.split('\n');
      let contextStaffId: string | null = null;

      lines.forEach((line, index) => {
        const currentLineNum = startLine + index;
        const trimmed = line.trim();
        
        if (!trimmed) return;
        if (trimmed.startsWith('meta')) return;
        
        if (trimmed.endsWith('{')) {
            const m = trimmed.match(/^(\w+):/);
            if (m) contextStaffId = m[1];
            return;
        }
        if (trimmed === '}' || trimmed === ']') {
            contextStaffId = null;
            return;
        }

        const lineMatch = trimmed.match(/^(\w+):\s*(.*)/);
        if (lineMatch) {
            let id = lineMatch[1];
            let content = lineMatch[2];
            
            let effectiveStaffId = id;
            if (contextStaffId && (id.startsWith('v') || id === 'voice')) {
                effectiveStaffId = contextStaffId;
            } else if (!contextStaffId) {
                effectiveStaffId = id;
            }

            content = content.replace(/\|/g, '').replace(/%%.*/, '').trim();
            if (content.endsWith('}')) content = content.slice(0, -1).trim();

            const staffEvents = this.parseStaffContent(content, effectiveStaffId, 0, currentLineNum);
            events.push(...staffEvents);
        }
      });
      return events;
  }

  private parseMetaString(metaStr: string) {
      const pairs = metaStr.split(',');
      pairs.forEach(p => {
          const [key, val] = p.split(':').map(s => s.trim().replace(/"/g, ''));
          this.globalMeta[key] = val;
          if (key === 'tempo') this.tempo = parseInt(val);
          if (key === 'time') {
              const [n, d] = val.split('/').map(Number);
              this.timeSignature = [n, d];
          }
      });
  }

  private parseStaffContent(content: string, staffId: string, startTime: number, sourceLine: number): NoteEvent[] {
    const macroUsageRegex = /(\$[\w]+)([+\-]\d+)?(\.[\w\d().]+)?/g;
    
    // In-place macro expansion attempt
    content = content.replace(macroUsageRegex, (match, macroName, transpose, modifiers) => {
        const rawContent = this.macros[macroName];
        if (!rawContent) return match; 
        return match; 
    });

    const events: NoteEvent[] = [];
    let localTime = startTime;
    
    const tokens = content.match(/(\([^)]+\):[\d/]+)|(\[[^\]]+\][:\w.(),]+)|(\$[\w]+[+\-\d]*[:\w.(),"]*)|([\w#+\-]+[:\w.(),"]*)|(\*\s*\d+)|(\S+)/g) || [];

    let lastEventForMultiply: NoteEvent[] = [];

    for (const token of tokens) {
        const cleanToken = token.trim();
        if (!cleanToken) continue;

        if (cleanToken.startsWith('*')) {
            const count = parseInt(cleanToken.replace('*', ''));
            if (lastEventForMultiply.length > 0) {
                 const template = lastEventForMultiply;
                 for(let i=0; i < count - 1; i++) {
                     template.forEach(e => {
                         const newEv = {...e, startTime: localTime};
                         events.push(newEv);
                         localTime += e.duration;
                     });
                 }
            }
            continue;
        }

        if (cleanToken.startsWith('$')) {
             const match = cleanToken.match(/^(\$[\w]+)([+\-]\d+)?(.*)/);
             if (match) {
                 const name = match[1];
                 const trans = match[2] ? parseInt(match[2]) : 0;
                 const modsStr = match[3]; 
                 const rawMacro = this.macros[name];
                 if (rawMacro) {
                     // Recursion for Macro. Source Line stays the same (it is invoked here)
                     const macroEvents = this.parseStaffContent(rawMacro, staffId, localTime, sourceLine);
                     let maxEnd = localTime;
                     macroEvents.forEach(ev => {
                         if (trans !== 0) {
                             ev.pitches = ev.pitches.map(p => this.transposePitch(p, trans));
                         }
                         if (modsStr) {
                             if (modsStr.startsWith('.')) {
                                 const mods = this.parseModifiers(modsStr);
                                 ev.modifiers.push(...mods.flags);
                                 if (mods.color) ev.color = mods.color;
                                 if (mods.head) ev.head = mods.head;
                                 ev.cc.push(...mods.cc);
                             }
                         }
                         if (ev.startTime + ev.duration > maxEnd) maxEnd = ev.startTime + ev.duration;
                     });
                     events.push(...macroEvents);
                     lastEventForMultiply = macroEvents;
                     localTime = maxEnd;
                     continue;
                 }
             }
        }

        if (cleanToken.startsWith('(')) {
            const tMatch = cleanToken.match(/\(([^)]+)\):(\d+)\/(\d+)/);
            if (tMatch) {
                const innerContent = tMatch[1];
                const num = parseInt(tMatch[2]);
                const den = parseInt(tMatch[3]);
                const ratio = den / num;
                const innerEvents = this.parseStaffContent(innerContent, staffId, localTime, sourceLine);
                let offset = 0;
                lastEventForMultiply = []; 
                innerEvents.forEach(e => {
                    e.duration *= ratio;
                    e.startTime = localTime + offset;
                    offset += e.duration;
                    events.push(e);
                    lastEventForMultiply.push(e);
                });
                localTime += offset;
                continue;
            }
        }

        const evs = this.parseToken(cleanToken, staffId, localTime, sourceLine);
        if (evs.length > 0) {
            events.push(...evs);
            localTime += evs[0].duration;
            lastEventForMultiply = evs;
        }
    }
    return events;
  }

  private parseToken(token: string, staffId: string, startTime: number, sourceLine: number): NoteEvent[] {
    let durationStr = '';
    let modifiersStr = '';

    const split = token.split(':');
    let pitchPart = split[0];
    
    if (split.length > 1) {
        const rest = split[1];
        const durMatch = rest.match(/^([\d.]+)(.*)/);
        if (durMatch) {
            durationStr = durMatch[1];
            modifiersStr = durMatch[2];
        } else {
            modifiersStr = rest;
        }
    }

    let duration = this.lastDurations[staffId] || 1.0;
    if (durationStr) {
        let base = 4 / parseInt(durationStr);
        duration = base;
        const dots = (durationStr.match(/\./g) || []).length;
        let add = base / 2;
        for(let i=0; i<dots; i++) {
            duration += add;
            add /= 2;
        }
        this.lastDurations[staffId] = duration;
    }

    const modData = this.parseModifiers(modifiersStr);
    const velocity = this.resolveVelocity(modData.flags);
    const resultEvents: NoteEvent[] = [];
    const isRest = pitchPart.startsWith('r');

    // Factory helper
    const createEv = (pitches: string[], detune: number = 0): NoteEvent => ({
        pitches,
        duration,
        velocity: isRest ? 0 : velocity,
        isRest,
        modifiers: modData.flags,
        startTime,
        staffId,
        detune,
        cc: modData.cc,
        color: modData.color,
        head: modData.head,
        sourceLine
    });

    if (isRest) {
        resultEvents.push(createEv([]));
    } else if (pitchPart.startsWith('[')) {
        const content = pitchPart.slice(1, -1);
        const rawPitches = content.split(/\s+/).filter(Boolean);
        const resolved = rawPitches.map(p => this.resolvePitch(p, staffId));
        resultEvents.push(createEv(resolved.map(r => r.pitch)));
    } else {
        const { pitch, detune } = this.resolvePitch(pitchPart, staffId);
        resultEvents.push(createEv([pitch], detune));
    }

    return resultEvents;
  }

  // ... (modifiers, velocity, pitch resolution, transpose methods remain the same)
  private parseModifiers(modStr: string): { flags: string[], cc: AutomationCurve[], color?: string, head?: string } {
      const result = {
          flags: [] as string[],
          cc: [] as AutomationCurve[],
          color: undefined as string | undefined,
          head: undefined as string | undefined
      };
      if (!modStr) return result;
      const regex = /\.([\w]+)(?:\(([^)]+)\))?/g;
      let match;
      while ((match = regex.exec(modStr)) !== null) {
          const name = match[1];
          const args = match[2];
          if (name === 'cc') {
              if (args) {
                  const parts = args.split(',').map(s => s.trim());
                  const ccNum = parseInt(parts[0]);
                  const valPart = parts.slice(1).join(',');
                  let values: number | [number, number] = 0;
                  if (valPart.startsWith('[')) {
                      const v = valPart.slice(1, -1).split(',').map(Number);
                      values = [v[0], v[1]];
                  } else {
                      values = parseFloat(valPart);
                  }
                  result.cc.push({ cc: ccNum, values });
              }
          } else if (name === 'color') {
              if (args) result.color = args.replace(/"/g, '');
          } else if (name === 'head') {
              if (args) result.head = args.replace(/"/g, '');
          } else {
              result.flags.push(name);
          }
      }
      return result;
  }
  
  private applyModifiersToEvent(ev: NoteEvent, mods: string[]) {
      mods.forEach(m => {
          if (!m.includes('(')) ev.modifiers.push(m);
      });
  }

  private resolveVelocity(modifiers: string[]): number {
      if (modifiers.includes('ffff')) return 1.0;
      if (modifiers.includes('fff')) return 0.95;
      if (modifiers.includes('ff')) return 0.9;
      if (modifiers.includes('f')) return 0.8;
      if (modifiers.includes('mf')) return 0.7;
      if (modifiers.includes('mp')) return 0.6;
      if (modifiers.includes('p')) return 0.5;
      if (modifiers.includes('pp')) return 0.3;
      if (modifiers.includes('ppp')) return 0.2;
      return 0.7; 
  }

  private resolvePitch(raw: string, staffId: string): { pitch: string, detune: number } {
    const match = raw.match(/^([a-gA-G])([#bx]*)(-?\d*)([+\-]\d+)?$/);
    if (!match) return { pitch: raw, detune: 0 };
    const step = match[1].toLowerCase();
    const acc = match[2];
    let octaveStr = match[3];
    const detuneStr = match[4];
    let octave = 4;
    if (octaveStr) {
        octave = parseInt(octaveStr);
        this.lastOctaves[staffId] = octave;
    } else {
        if (this.lastOctaves[staffId] !== undefined) octave = this.lastOctaves[staffId];
        else { octave = 4; this.lastOctaves[staffId] = 4; }
    }
    const detune = detuneStr ? parseInt(detuneStr) : 0;
    return { pitch: `${step}${acc}${octave}`, detune };
  }

  private transposePitch(pitch: string, semitones: number): string {
      const match = pitch.match(/^([a-gA-G])([#bx]*)(-?\d*)([+\-]\d+)?$/);
      if (!match) return pitch;
      const step = match[1].toLowerCase();
      const acc = match[2];
      const oct = parseInt(match[3]);
      const detune = match[4] || '';
      let idx = this.notes.indexOf(step);
      if (acc === '#') idx += 1;
      if (acc === 'b') idx -= 1;
      let absIndex = (oct * 12) + idx + semitones;
      const newOct = Math.floor(absIndex / 12);
      const newStepIdx = absIndex % 12;
      const safeIdx = (newStepIdx + 12) % 12;
      const newNote = this.notes[safeIdx];
      let newStep = newNote;
      let newAcc = '';
      if (newNote.length > 1) { newStep = newNote[0]; newAcc = newNote.slice(1); }
      return `${newStep}${newAcc}${newOct}${detune}`;
  }
}

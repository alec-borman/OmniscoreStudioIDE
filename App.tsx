
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OmniCompiler } from './omniParser';
import { PianoSynth } from './AudioEngine';
import { OmniScore, TransportState } from './types';

// --- Ω-STUDIO: THE DISSIPATIVE ENGINE ---
const INITIAL_CODE = `omniscore
meta {
  title: "Symphony No. Ω: The Dissipative Mind",
  composer: "Virtual Maestro Node",
  tempo: 60,
  tension_gradient: 0.1,
  thematic_density: 3, 
  strict: true
}

group "The Friction Core" symbol=bracket {
  def vln1 "Lyrical Friction I" style=standard keyswitch={ transcendence: 24, suffering: 25 }
  def vln2 "Lyrical Friction II" style=standard
  def vla  "Inner Entropy"      style=standard clef=alto
}

group "The Coda-Bringers" symbol=bracket {
  def tpt  "The Herald"         style=standard transpose=+2
  def tbn  "Gravity's Voice"    style=standard clef=bass
}

group "The Clocks of Fate" symbol=line {
  def clk  "Metabolic Pulse"    style=grid map={ f: 0, s: 4 }
}

macro $FateSeed = { g4:4.ten f#4:8.stacc r:8 } 
macro $Spark    = { (c5 d5 eb5):3/2 }           
macro $Gravity  = { g2:1.cc(11, [20, 110]) }    

%% --- PHASE 1 ---
measure 1-10
  vln1: g4+14:1.suffering.cc(1, [0, 80]).color("cyan") |
  vln2: r:1 |
  vla:  eb4-12:1.cc(1, [0, 40]) |
  clk:  f:4 r:4 f:4 r:4 |

measure 11-20
  meta { tension_gradient: 0.35 }
  vln1: $FateSeed $FateSeed+2 |
  vln2: r:2 $FateSeed-5 |
  vla:  [c4 eb4 g4]:2.gliss [b3 d4 f#4]:2 |
  clk:  f:8 f:8 f:8 f:8 s:4.acc |

measure 21-40
  vln1: $Spark $Spark+1 $Spark+2 $Spark+3.accent |
  vln2: $Spark-12:1.gliss g4:1 |
  tpt:  r:1 * 10 r:2 g4:2.cc(1, [0, 100]).ten |

%% --- PHASE 2 ---
measure 41-60
  meta { tempo: 120, tension_gradient: 0.75 }
  vln1: {
    v1: g4:8.bm a b c5.bme d5:4.accent |
    v2: eb4:4.stacc $FateSeed-12 |
  }
  tpt:  g4:4.ff $FateSeed.accent |
  tbn:  c3:2.cc(11, [80, 127]) c2:2 |
  clk:  s:16 s s s s:8.ghost k:8 |

measure 61-90
  vln1: $Spark.color("red") $FateSeed.stacc $Spark+7 |
  vla:  $FateSeed-12.cc(1, 100) $FateSeed-12 |
  tpt:  [g4 c5 e5]:2.arp.ff [ab4 db5 f5]:2.arp |
  tbn:  $Gravity.color("red") |
  clk:  (f:8 s:8 k:8):3/2 s:4.roll |

measure 91-110
  meta { tension_gradient: 0.95 }
  vln1: c6:1.ff.gliss c5:1.gliss c4:1 |
  tpt:  g5:4.marcato f#5:4 f5:4 e5:4 |
  tbn:  [c2 g2 c3]:1.ffff.cc(1, 127) |
  clk:  s:4.roll.cc(11, [0, 127]) s:4.roll s:4.roll s:4.roll |

measure 150
  meta { stretch: 2.0 }
  vln1: [c4 e4 g4 c5]:1.p.head("diamond") |
  clk:  f:1.head("x").color("black") |
  |]
`;

// --- THE ORACLE'S DICTIONARY ---
const philosophicalErrors: Record<string, string> = {
    "Unexpected token": "THE SYNTAX HAS COLLAPSED. THE UNIVERSE REJECTS THIS FORM.",
    "Invalid pitch": "YOU SEEK A NOTE THAT EXISTS ONLY IN THE VOID.",
    "Unclosed block": "A THOUGHT REMAINS UNFINISHED. CLOSE THE LOOP OR FACE INFINITY.",
    "default": "ENTROPY DETECTED. THE CODE CANNOT HOLD ITS SHAPE."
};

const App: React.FC = () => {
  const [code, setCode] = useState(INITIAL_CODE);
  const [score, setScore] = useState<OmniScore | null>(null);
  const [transportState, setTransportState] = useState<TransportState>(TransportState.STOPPED);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeLines, setActiveLines] = useState<Set<number>>(new Set());
  
  // Thermodynamic State
  const [wobble, setWobble] = useState(0); // 0-1
  const [entropy, setEntropy] = useState(0); // 0-100
  const [heat, setHeat] = useState(0); // 0-100
  const [resonance, setResonance] = useState(false);

  const compilerRef = useRef(new OmniCompiler());
  const synthRef = useRef(new PianoSynth());
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Particles for Visualizer
  const particlesRef = useRef<Array<{x: number, y: number, z: number, color: string, life: number}>>([]);

  useEffect(() => {
    try {
      const compiled = compilerRef.current.compile(code);
      setScore(compiled);
      setError(null);
      // Calc entropy based on note density
      const density = compiled.events.length / Math.max(1, compiled.totalBeats);
      setEntropy(Math.min(100, density * 10));
      setHeat(Math.min(100, compiled.staves.length * 10 + density * 5));
    } catch (e: any) {
      console.error(e);
      const msg = e.message || "Unknown error";
      const phiKey = Object.keys(philosophicalErrors).find(k => msg.includes(k)) || "default";
      setError(philosophicalErrors[phiKey] + ` (${msg})`);
    }
  }, [code]);

  useEffect(() => {
      synthRef.current.setWobble(wobble);
  }, [wobble]);

  const togglePlay = async () => {
    if (!score) return;
    await synthRef.current.init();
    if (transportState === TransportState.PLAYING) {
        synthRef.current.pause();
        setTransportState(TransportState.PAUSED);
    } else {
        synthRef.current.play(score, false);
        setTransportState(TransportState.PLAYING);
    }
  };

  const stop = () => {
      synthRef.current.stop();
      setTransportState(TransportState.STOPPED);
      setCurrentBeat(0);
      setActiveLines(new Set());
      setResonance(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!score || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft;
      const beat = x / 20; 
      synthRef.current.setTransportPosition(beat, score);
      setCurrentBeat(beat);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (highlightRef.current) {
          highlightRef.current.scrollTop = e.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
  };

  const renderVisualizer = useCallback(() => {
      if (!canvasRef.current || !score) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      const pxPerBeat = 20;

      let beat = currentBeat;

      if (transportState === TransportState.PLAYING) {
          beat = synthRef.current.getCurrentBeat(score);
          setCurrentBeat(beat);
          if (containerRef.current) {
             // Keep current beat somewhat centered
             const center = containerRef.current.clientWidth / 3;
             containerRef.current.scrollLeft = (beat * pxPerBeat) - center;
          }
      }

      // Check for resonance (phase alignment)
      setResonance(Math.floor(beat) % 8 === 0 && transportState === TransportState.PLAYING);

      if (score) {
          const active = new Set<number>();
          score.events.forEach(ev => {
              if (beat >= ev.startTime && beat < (ev.startTime + ev.duration)) {
                  active.add(ev.sourceLine);
                  
                  // Emit particles if active and not already handled (simple stochastic emission)
                  if (Math.random() > 0.8) {
                      const yPos = 300 - (ev.pitches.length * 20); // rough approximation
                      particlesRef.current.push({
                          x: (ev.startTime * pxPerBeat) + (Math.random() * 20),
                          y: height / 2 + (Math.random() - 0.5) * 200,
                          z: Math.random(),
                          color: ev.color || (ev.pitches.length > 2 ? '#fff' : '#0ff'),
                          life: 1.0
                      });
                  }
              }
          });
          setActiveLines(active);
          
          if (active.size > 0 && textareaRef.current && transportState === TransportState.PLAYING) {
              const firstLine = Array.from(active).sort((a,b) => a-b)[0];
              const top = firstLine * 20;
              const viewTop = textareaRef.current.scrollTop;
              const viewHeight = textareaRef.current.clientHeight;
              if (top < viewTop || top > viewTop + viewHeight - 50) {
                   textareaRef.current.scrollTo({ top: top - 100, behavior: 'smooth' });
              }
          }
      }

      // --- RENDER SPECTRAL PRISM ---
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, width, height);
      
      // Phase Space Grid
      ctx.strokeStyle = '#1a1a1f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < width; i += 40) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i, height);
      }
      ctx.stroke();

      // Render Notes as Geometric Forms
      score.events.forEach(ev => {
          if (ev.isRest) return;
          const x = ev.startTime * pxPerBeat;
          const w = ev.duration * pxPerBeat;
          
          let yOffset = height / 2;
          let color = ev.color || 'rgba(100,100,100,0.5)';
          
          // Map vertical position based on timbre/staff
          if (ev.staffId.includes('vln')) yOffset = height * 0.3;
          else if (ev.staffId.includes('vla')) yOffset = height * 0.45;
          else if (ev.staffId.includes('tbn')) yOffset = height * 0.7;
          else if (ev.staffId.includes('clk')) yOffset = height * 0.9;
          
          // Fine tune Y by pitch
          if (ev.pitches.length > 0) {
              const pitchVal = ev.pitches[0];
              const octave = parseInt(pitchVal.match(/-?\d+/)?.[0] || '4');
              yOffset -= (octave - 4) * 20;
          }

          // Apply wobble to visual
          const visualJitterX = (Math.random() - 0.5) * wobble * 5;
          const visualJitterY = (Math.random() - 0.5) * wobble * 5;

          const isActive = beat >= ev.startTime && beat < (ev.startTime + ev.duration);
          
          if (isActive) {
              ctx.fillStyle = '#fff';
              ctx.shadowColor = color;
              ctx.shadowBlur = 15 + (wobble * 20);
          } else {
              ctx.fillStyle = color;
              ctx.shadowBlur = 0;
          }

          // Draw "Dissipative Blocks"
          ctx.fillRect(x + visualJitterX, yOffset + visualJitterY, w - 1, 8);
          
          // Draw "Connections" (Lorenz Attractor lines) if active
          if (isActive) {
              ctx.beginPath();
              ctx.strokeStyle = color;
              ctx.lineWidth = 0.5;
              ctx.moveTo(x + w/2, yOffset + 4);
              ctx.lineTo(beat * pxPerBeat, height/2);
              ctx.stroke();
          }
      });

      // Render Dissipative Cloud Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.life -= 0.02;
          p.x += (Math.random() - 0.5) * 2; // Brownian motion
          p.y += (Math.random() - 0.5) * 2;
          
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.life;
          const size = p.z * 4;
          ctx.fillRect(p.x, p.y, size, size);
          ctx.globalAlpha = 1.0;
          
          if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // Playhead (The Event Horizon)
      const headX = beat * pxPerBeat;
      ctx.strokeStyle = resonance ? '#00fffc' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.shadowColor = resonance ? '#00fffc' : '#ef4444';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(headX, 0);
      ctx.lineTo(headX, height);
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(renderVisualizer);
  }, [score, transportState, currentBeat, wobble, resonance]);

  useEffect(() => {
      if (score && containerRef.current && canvasRef.current) {
          const totalWidth = (score.totalBeats + 10) * 20; 
          canvasRef.current.width = Math.max(containerRef.current.clientWidth, totalWidth);
          canvasRef.current.height = containerRef.current.clientHeight;
      }
      animationFrameRef.current = requestAnimationFrame(renderVisualizer);
      return () => cancelAnimationFrame(animationFrameRef.current);
  }, [score, renderVisualizer]);

  const codeLines = useMemo(() => {
      return code.split('\n');
  }, [code]);

  return (
    <div className="flex flex-col h-screen bg-[#050507] text-[#e2e2e7] overflow-hidden font-mono selection:bg-cyan-900 selection:text-white">
      
      {/* FRISTON DASHBOARD */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-900 bg-[#0a0a0c] z-20 shadow-lg">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold font-serif glitch-text tracking-wide text-white">Ω<span className="text-cyan-500">-STUDIO</span></h1>
            <p className="text-[9px] text-gray-500 font-mono tracking-[0.3em] uppercase">Dissipative Engine v4.2</p>
          </div>
          
          {/* BIOMETRIC GAUGES */}
          <div className="flex gap-4 ml-8">
              <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest">Entropy (ΔS)</span>
                  <div className="w-24 h-1 bg-gray-800 rounded overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${entropy}%` }}></div>
                  </div>
              </div>
              <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest">Cog. Load</span>
                  <div className="w-24 h-1 bg-gray-800 rounded overflow-hidden">
                      <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${heat}%` }}></div>
                  </div>
              </div>
              <div className="flex flex-col gap-1 items-center">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest">Resonance</span>
                  <div className={`w-2 h-2 rounded-full ${resonance ? 'bg-white shadow-[0_0_10px_white]' : 'bg-gray-800'} transition-all duration-100`}></div>
              </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 border border-gray-800 rounded p-1 bg-black/40">
                 <button onClick={togglePlay} className="w-10 h-8 flex items-center justify-center hover:bg-white/5 rounded text-cyan-400 transition-colors">
                     {transportState === TransportState.PLAYING ? '||' : '▶'}
                 </button>
                 <button onClick={stop} className="w-10 h-8 flex items-center justify-center hover:bg-white/5 rounded text-red-400 transition-colors">■</button>
            </div>
            
            {/* WOBBLE SLIDER */}
            <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                <span className="text-[9px] text-gray-500 uppercase tracking-widest">Wobble</span>
                <input 
                    type="range" 
                    min="0" max="1" step="0.01" 
                    value={wobble}
                    onChange={(e) => setWobble(parseFloat(e.target.value))}
                    className="w-24 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
            </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* CHRONOS-FLOW EDITOR */}
        <div className="w-1/2 flex flex-col border-r border-gray-900 relative z-0 bg-[#08080a]">
            <div 
                className="relative w-full h-full font-mono text-xs leading-5"
                // Apply visual blur based on Wobble factor
                style={{ filter: `blur(${wobble * 1.5}px)`, transition: 'filter 0.1s' }}
            >
                {/* HIGHLIGHT LAYER (Dynamic Syntax Irradiance) */}
                <div 
                    ref={highlightRef}
                    className="absolute inset-0 pointer-events-none p-6 overflow-hidden text-transparent whitespace-pre-wrap z-0"
                    aria-hidden="true"
                >
                    {codeLines.map((line, i) => (
                        <div key={i} className={`w-full ${activeLines.has(i) ? 'bg-cyan-900/20 shadow-[0_0_20px_rgba(6,182,212,0.15)] border-l-2 border-cyan-500/50 pl-2' : 'pl-[2px]'}`}>
                           {line || '\n'} 
                        </div>
                    ))}
                </div>

                {/* TEXTAREA LAYER */}
                <textarea
                    ref={textareaRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onScroll={handleScroll}
                    className="absolute inset-0 w-full h-full bg-transparent p-6 text-gray-400 resize-none focus:outline-none custom-scrollbar z-10 font-medium"
                    spellCheck={false}
                    style={{ lineHeight: '20px' }} 
                />
            </div>

            {/* THE ORACLE CONSOLE */}
            <div className="h-32 bg-[#050506] border-t border-gray-900 p-4 font-mono text-[10px] text-gray-500 overflow-y-auto z-20 shadow-inner">
                <div className="uppercase tracking-widest mb-2 text-gray-600">Oracle Output log</div>
                {error ? (
                    <div className="text-red-400 glitch-text">{`>> ${error}`}</div>
                ) : (
                    <div className="text-green-900/50">{`>> SYSTEM NOMINAL. REALITY ENGINE STABLE. [Resonance: ${(entropy * heat / 100).toFixed(2)}%]`}</div>
                )}
            </div>
        </div>

        {/* SPECTRAL PRISM VISUALIZER */}
        <div className="w-1/2 bg-[#000] relative flex flex-col">
            <div 
                ref={containerRef}
                className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative cursor-crosshair"
                onClick={handleSeek}
                style={{
                    backgroundImage: 'radial-gradient(circle at 50% 50%, #111 0%, #000 100%)'
                }}
            >
                <canvas ref={canvasRef} className="block" />
            </div>
            
            <div className="h-6 border-t border-gray-900 bg-[#050507] flex items-center px-4 gap-6 font-mono text-[9px] text-gray-700 uppercase tracking-wider justify-between">
                <div>Phase Space: Active</div>
                <div>{currentBeat.toFixed(2)} / {score?.totalBeats.toFixed(2)}</div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default App;

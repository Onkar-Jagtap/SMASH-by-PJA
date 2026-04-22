import React, { useState, useEffect, useRef } from "react";
import { playPow } from "../lib/audio";

interface Bug {
  id: string;
  x: number;
  y: number;
  type: "normal" | "golden" | "skull";
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export function MiniGame({ percent }: { percent: number }) {
  const [score, setScore] = useState(() => {
    return parseInt(localStorage.getItem("smash_highscore") || "0");
  });
  const [sessionScore, setSessionScore] = useState(0);
  const [speed, setSpeed] = useState(1000);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [bossMode, setBossMode] = useState(false);
  const [bossHealth, setBossHealth] = useState(15);
  const [bossDefeated, setBossDefeated] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shaking, setShaking] = useState(0);

  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    if (percent >= 98 && !bossDefeated) {
      setBossMode(true);
      setBugs([]); // clear normal bugs
    }
  }, [percent, bossDefeated]);

  useEffect(() => {
    const newSpeed = Math.max(600, 1000 - Math.floor(sessionScore / 500) * 50);
    setSpeed(newSpeed);
  }, [sessionScore]);

  useEffect(() => {
    let animationId: number;
    let lastTime = 0;
    let accumulatedTime = 0;

    const tick = (time: number) => {
      if (!lastTime) lastTime = time;
      
      if (!bossMode) {
         const deltaTime = time - lastTime;
         accumulatedTime += deltaTime;
         
         if (accumulatedTime > speed) {
            accumulatedTime = 0;
            setBugs(current => {
              let next = [...current];
              if (next.length > 4) next.shift(); // Max 5 bugs
              const typeRoll = Math.random();
              const type = (sessionScore > 1000 && typeRoll > 0.9) ? "golden" : (sessionScore > 2000 && typeRoll < 0.15) ? "skull" : "normal";
              
              next.push({
                id: Math.random().toString(36),
                x: 10 + Math.random() * 80,
                y: 10 + Math.random() * 70,
                type
              });
              return next;
            });
         }
      }
      
      lastTime = time;
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [speed, bossMode, sessionScore]);

  const addParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          id: Math.random().toString(),
          x, y,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15 - 5,
          life: 0,
          maxLife: 30 + Math.random() * 20,
          color
        });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    let animationId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const remaining: Particle[] = [];
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.8; // gravity
        p.life++;
        if (p.life < p.maxLife) {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 6, 6);
          remaining.push(p);
        }
      }
      particlesRef.current = remaining;
      animationId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  const handleSmash = (e: React.MouseEvent, bug: Bug) => {
    e.stopPropagation();
    
    if (bug.type === "skull") {
      playPow(); // maybe sad noise
      setShaking(prev => prev + 1);
      setTimeout(() => setShaking(prev => prev - 1), 500);
      setSessionScore(s => Math.max(0, s - 500));
      const rect = e.currentTarget.getBoundingClientRect();
      addParticles(rect.left + 15, rect.top + 15, "#fff", 20); // white skull explode
      setBugs(current => current.filter(b => b.id !== bug.id));
      return;
    }

    playPow();
    setShaking(prev => prev + 1);
    setTimeout(() => setShaking(prev => prev - 1), 300);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = canvasRef.current!.getBoundingClientRect();
    const px = Math.min(Math.max(rect.left - parentRect.left + 15, 0), parentRect.width);
    const py = Math.min(Math.max(rect.top - parentRect.top + 15, 0), parentRect.height);
    
    addParticles(px, py, bug.type === "golden" ? "#f8d820" : "#00B140", 30);
    
    setSessionScore((s) => {
      const newScore = s + (bug.type === "golden" ? 300 : 100);
      if (newScore > score) {
        setScore(newScore);
        localStorage.setItem("smash_highscore", newScore.toString());
      }
      return newScore;
    });
    setBugs(current => current.filter(b => b.id !== bug.id));
  };

  const handleBossHit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bossHealth <= 0) return;
    playPow();
    setShaking(prev => prev + 1);
    setTimeout(() => setShaking(prev => prev - 1), 300);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = canvasRef.current!.getBoundingClientRect();
    addParticles(rect.left - parentRect.left + 50, rect.top - parentRect.top + 50, "#e52521", 50);

    setBossHealth(h => h - 1);
    if (bossHealth - 1 <= 0) {
      setBossDefeated(true);
      setBossMode(false);
      setSessionScore(s => s + 5000); // Massive Boss Points!
    }
  };

  return (
    <div className={`w-full h-[250px] bg-black retro-border shadow-[4px_4px_0_0_#fff] relative overflow-hidden retro-bg-clouds cursor-crosshair group mt-6 ${shaking > 0 ? 'animate-shake' : ''}`} style={{ backgroundImage: "linear-gradient(#000 2px, transparent 2px), linear-gradient(90deg, #000 2px, transparent 2px)", backgroundSize: "40px 40px", backgroundColor: "#222" }}>
      
      {/* Particle Canvas Layer */}
      <canvas ref={canvasRef} width={800} height={250} className="absolute inset-0 pointer-events-none z-20 w-full h-full" />

      {/* HUD Background elements */}
      <div className="absolute top-3 left-3 text-white font-pixel text-[10px] md:text-xs z-30 p-2 bg-black border-2 border-white" style={{ textShadow: "1px 1px 0 #e52521" }}>
        PT: {sessionScore.toString().padStart(5, '0')} | HI: {score.toString().padStart(5, '0')}
      </div>
      
      {!bossMode ? (
        <>
          <div className="absolute top-3 right-3 text-[#f8d820] font-pixel text-[10px] md:text-xs z-30 p-2 bg-black border-2 border-[#f8d820]" style={{ textShadow: "1px 1px 0 #000" }}>
            SMASH THE BUGBOTS!
          </div>

          {bugs.map((b) => (
             <div 
               key={b.id}
               onClick={(e) => handleSmash(e, b)}
               className={`absolute text-3xl md:text-5xl select-none z-10 hover:scale-125 transition-transform ${b.type === "golden" ? "animate-pulse drop-shadow-lg filter brightness-150" : b.type === "skull" ? "filter grayscale drop-shadow-lg" : ""}`}
               style={{ left: `${b.x}%`, top: `${b.y}%` }}
             >
               {b.type === 'normal' ? '👾' : b.type === 'golden' ? '⭐' : '💀'}
             </div>
          ))}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-black/80">
           <div className="text-[#e52521] text-2xl md:text-3xl font-pixel-heading mb-4 glitch animate-pulse" data-text="DATA DRAGON">DATA DRAGON</div>
           <div 
             onClick={handleBossHit}
             className="text-6xl md:text-8xl hover:scale-110 active:scale-90 transition-transform cursor-crosshair filter drop-shadow-[0_0_20px_rgba(229,37,33,0.8)]"
           >
             🐉
           </div>
           
           {/* Boss Health Bar */}
           <div className="w-[200px] h-4 bg-black border-2 border-white mt-8 relative">
              <div className="h-full bg-[#e52521] transition-all" style={{ width: `${(bossHealth / 15) * 100}%` }} />
           </div>
           <div className="text-white text-[10px] mt-2 font-pixel">CLICK 10X TO UNLOCK LOOT!</div>
        </div>
      )}

    </div>
  );
}

import React, { useState, useEffect } from "react";
import { playThud, playUnlock, playFanfare } from "../lib/audio";

export function LootChest({ onUnlock }: { onUnlock: () => void }) {
  const [phase, setPhase] = useState<"falling" | "waiting" | "unlocking" | "opened">("falling");
  const [particles, setParticles] = useState<{ id: string, x: number, y: number, vx: number, vy: number, emoji: string }[]>([]);

  useEffect(() => {
    // Initial drop thud
    const timer = setTimeout(() => {
      setPhase("waiting");
      playThud();
    }, 800); // Wait for CSS animation drop
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "unlocking") return;
    
    // Animate particles
    let animationId: number;
    const animate = () => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vy: p.vy + 0.5 // Gravity
      })));
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [phase]);

  const handleUnlock = () => {
    if (phase !== "waiting") return;
    
    setPhase("unlocking");
    playUnlock();
    playFanfare();

    // Generate disk particles
    const emojis = ["💾", "📊", "💰", "💎"];
    const newParticles = [];
    for (let i = 0; i < 40; i++) {
       newParticles.push({
         id: Math.random().toString(),
         x: 0,
         y: 0,
         vx: (Math.random() - 0.5) * 20,
         vy: -Math.random() * 20 - 5,
         emoji: emojis[Math.floor(Math.random() * emojis.length)]
       });
    }
    setParticles(newParticles);

    setTimeout(() => {
      setPhase("opened");
      setTimeout(() => onUnlock(), 1000);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="relative w-full max-w-lg h-full flex items-center justify-center">
         
         <div className="absolute top-10 text-center w-full">
            <h2 className="text-white text-2xl font-pixel-heading mb-2 text-shadow-xl glitch animate-pulse" data-text="LOOT ACQUIRED!">
               LOOT ACQUIRED!
            </h2>
            {phase === "waiting" && <p className="text-[#f8d820] text-xs font-pixel">CLICK CHEST TO EXTRACT PAYLOAD</p>}
         </div>

         {/* Chest Container */}
         <div className="relative flex justify-center items-center w-[300px] h-[300px]">
            {phase === "falling" && (
              <div className="text-8xl drop-shadow-[0_0_20px_#f8d820] animate-loot-drop">
                 📦
              </div>
            )}
            
            {phase === "waiting" && (
              <div 
                className="text-8xl drop-shadow-[0_0_20px_#f8d820] cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                onClick={handleUnlock}
              >
                 📦
              </div>
            )}
            
            {phase === "unlocking" && (
              <div className="text-8xl drop-shadow-[0_0_30px_#00FF41] animate-shake">
                 🧰
                 
                 {/* Particles */}
                 {particles.map(p => (
                   <div 
                     key={p.id} 
                     className="absolute text-2xl"
                     style={{
                       left: `50%`,
                       top: `50%`,
                       transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`
                     }}
                   >
                     {p.emoji}
                   </div>
                 ))}
              </div>
            )}
            
            {phase === "opened" && (
              <div className="text-8xl drop-shadow-[0_0_20px_#00B140]">
                 📂
              </div>
            )}
         </div>

      </div>
    </div>
  );
}

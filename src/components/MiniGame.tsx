import React, { useState, useEffect } from "react";
import { playPow } from "../lib/audio";

export function MiniGame() {
  const [score, setScore] = useState(() => {
    return parseInt(localStorage.getItem("smash_highscore") || "0");
  });
  const [sessionScore, setSessionScore] = useState(0);
  const [speed, setSpeed] = useState(850);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [visible, setVisible] = useState(true);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    // Speed increases as score increases, but maxes out at a playable 600ms
    const newSpeed = Math.max(600, 1000 - Math.floor(sessionScore / 500) * 50);
    setSpeed(newSpeed);
  }, [sessionScore]);

  useEffect(() => {
    // Moves the target every 850ms to make it challenging
    const i = setInterval(() => {
      setPos({
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 70
      });
      setVisible(true);
    }, speed);
    return () => clearInterval(i);
  }, [speed]);

  const handleSmash = () => {
    if (!visible) return;
    playPow();
    setShaking(true);
    setTimeout(() => setShaking(false), 300);
    
    setSessionScore((s) => {
      const newScore = s + 100;
      if (newScore > score) {
        setScore(newScore);
        localStorage.setItem("smash_highscore", newScore.toString());
      }
      return newScore;
    });
    setVisible(false);
  };

  return (
    <div className={`w-full h-[200px] bg-black retro-border shadow-[4px_4px_0_0_#fff] relative overflow-hidden retro-bg-clouds cursor-crosshair group mt-6 ${shaking ? 'animate-shake' : ''}`} style={{ backgroundImage: "linear-gradient(#000 2px, transparent 2px), linear-gradient(90deg, #000 2px, transparent 2px)", backgroundSize: "40px 40px", backgroundColor: "#222" }}>
      
      {/* HUD Background elements */}
      <div className="absolute top-3 left-3 text-white font-pixel text-[10px] md:text-xs z-10 p-2 bg-black border-2 border-white" style={{ textShadow: "1px 1px 0 #e52521" }}>
        PT: {sessionScore.toString().padStart(5, '0')} | HI: {score.toString().padStart(5, '0')}
      </div>
      <div className="absolute top-3 right-3 text-[#f8d820] font-pixel text-xs z-10 animate-pulse p-2 bg-black border-2 border-[#f8d820]" style={{ textShadow: "1px 1px 0 #000" }}>
        SMASH THE BUGBOT!
      </div>
      
      {/* Play Area */}
      {visible && (
        <div 
          onClick={(e) => { e.preventDefault(); handleSmash(); }}
          onPointerDown={(e) => { e.preventDefault(); handleSmash(); }}
          className="absolute text-5xl hover:scale-125 transition-transform select-none z-20 cursor-pointer pointer-events-auto"
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, textShadow: "4px 4px 0 #000" }}
        >
          👾
        </div>
      )}
      {!visible && (
        <div 
          className="absolute text-3xl select-none text-[#e52521] font-bold font-pixel z-20 pointer-events-none"
          style={{ left: `${pos.x}%`, top: `${pos.y}%`, textShadow: "2px 2px 0 #fff" }}
        >
          POW!
        </div>
      )}

      <div className="absolute bottom-2 left-0 w-full text-center text-[8px] text-gray-500 font-pixel">
        MINIGAME ENGAGED WHILE AI PROCESSES
      </div>
    </div>
  );
}

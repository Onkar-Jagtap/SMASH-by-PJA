import React, { useState } from "react";
import { parseFile, exportResults } from "./lib/file-utils";
import EngineWorker from "./lib/engine.worker?worker";
import { saveSession, loadSession, clearSession } from "./lib/session";
import { MiniGame } from "./components/MiniGame";
import { LootChest } from "./components/LootChest";
import { BrainManualModal } from "./components/BrainManualModal";
import { playBloop, playFight, setMuted } from "./lib/audio";
import { motion } from "motion/react";

export default function App() {
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [targetList, setTargetList] = useState<string[]>([]);
  const [suppList, setSuppList] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, text: "" });
  const [results, setResults] = useState<any[]>([]);
  const [errorLog, setErrorLog] = useState("");
  const [showWarning, setShowWarning] = useState<"csv" | "xlsx" | null>(null);
  const [showLootChest, setShowLootChest] = useState(false);
  const [showBrainManual, setShowBrainManual] = useState(false);
  
  const [tickerLog, setTickerLog] = useState<string>("SYSTEM IDLE... INSERT COIN");
  
  // Auth Gates
  const [authPayload, setAuthPayload] = useState<{ type: string, value: string } | null>(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authMode, setAuthMode] = useState<"password" | "key">("key");
  const [workerRef, setWorkerRef] = useState<Worker | null>(null);

  React.useEffect(() => {
    // Check for cached session on mount
    loadSession('activeSession').then(data => {
       if (data && data.targetList?.length > 0) {
          if (window.confirm("Found an interrupted session in cache! Resume?")) {
              setTargetList(data.targetList);
              setSuppList(data.suppList);
              // We won't automatically run, but the files are loaded.
          } else {
              clearSession();
          }
       }
    }).catch(console.error);
  }, []);

  const calculateStats = (res: any[]) => {
    let flawless = 0;
    let aiRescues = 0;
    let rejected = 0;

    res.forEach(item => {
      const best = item.matches[0];
      if (!best) {
        rejected++;
        return;
      }
      if (best.relation === "same_company" || best.relation === "same_group") {
        if (best.source === "gemini_api") aiRescues++;
        else flawless++;
      } else {
        rejected++;
      }
    });

    return { flawless, aiRescues, rejected };
  };

  const handleTargetUpload = async (e: React.ChangeEvent<HTMLInputElement> | any) => {
    if (e.target.files?.[0]) {
      playBloop();
      try {
        setErrorLog("");
        const names = await parseFile(e.target.files[0]);
        setTargetList(names);
        saveSession('activeSession', { targetList: names, suppList });
      } catch (err: any) {
        setErrorLog(err.message);
      }
    }
  };

  const handleSuppUpload = async (e: React.ChangeEvent<HTMLInputElement> | any) => {
    if (e.target.files?.[0]) {
      playBloop();
      try {
        setErrorLog("");
        const names = await parseFile(e.target.files[0]);
        setSuppList(names);
        saveSession('activeSession', { targetList, suppList: names });
      } catch (err: any) {
        setErrorLog(err.message);
      }
    }
  };

  const handleStart = async () => {
    if (!targetList.length || !suppList.length) {
      setErrorLog("EQUIPPING FAILED: LOAD BOTH LISTS NOOB");
      return;
    }
    
    if (!authPayload) {
       playBloop();
       setShowAuthGate(true);
       return;
    }
    
    playFight();
    setIsProcessing(true);
    setResults([]);
    setErrorLog("");
    setProgress({ percent: 0, text: "SPAWNING KOMBATANTS..." });
    
    if (workerRef) workerRef.terminate();
    
    const worker = new EngineWorker();
    setWorkerRef(worker);

    worker.postMessage({ type: 'run', payload: { inputList: targetList, suppList, authPayload } });

    worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'progress') {
        setProgress({ percent: data.percent, text: data.text });
        if (data.liveStr) setTickerLog(data.liveStr);
      } else if (data.type === 'done') {
        setResults(data.results);
        setTickerLog("MATCH COMPLETE! LOOT UNLOCKED! 🏆");
        setIsProcessing(false);
        setWorkerRef(null);
        clearSession(); // Clean up successfully completed sessions
      } else if (data.type === 'error') {
        setErrorLog("FATAL K.O.: " + data.error);
        setTickerLog(`FATAL SYSTEM CRASH: ${data.error}`);
        setIsProcessing(false);
        setWorkerRef(null);
      }
    };
  };

  const handleAuthSubmit = () => {
     if (!authInput.trim()) return;
     playBloop();
     setAuthPayload({ type: authMode, value: authInput.trim() });
     setShowAuthGate(false);
  };

  React.useEffect(() => {
     if (authPayload && !isProcessing && targetList.length > 0 && suppList.length > 0) {
         if (!results.length && progress.percent === 0) {
           handleStart();
         }
     }
  }, [authPayload, targetList.length, suppList.length]);

  return (
    <div className="relative min-h-screen bg-[#5C94FC] text-black font-pixel p-4 md:p-8 lg:p-12 overflow-x-hidden pt-16">
      
      {/* Top Token Bar (ALWAYS VISIBLE NOW) */}
      <div className="fixed top-0 left-0 w-full bg-black border-b-4 border-gray-600 z-50 flex items-center justify-between px-4 py-2 text-white font-pixel text-[8px] md:text-xs shadow-[0_4px_0_0_#000]">
         <div className="flex items-center gap-2">
           {authPayload ? (
             <>
               <span className="animate-pulse">🟢</span>
               <span className="hidden sm:inline">
                 {authPayload.type === "password" ? "ADMIN BYPASS MODE" : "CUSTOM API KEY ACTIVE"}
               </span>
               <span className="sm:hidden">
                 {authPayload.type === "password" ? "ADMIN" : "API KEY"}
               </span>
             </>
           ) : (
             <>
               <span className="animate-pulse text-[#e52521]">🔴</span>
               <span>SYSTEM STANDBY</span>
             </>
           )}
         </div>
         
         <div className="flex items-center gap-2 md:gap-4">
            <button 
               onClick={() => {
                 playBloop();
                 setShowBrainManual(true);
               }}
               className="hover:scale-105 transition-transform bg-[#f8d820] text-black border border-gray-600 px-2 py-1 flex gap-2 items-center focus:outline-none hidden sm:flex"
               title="Brain & Manual"
            >
               🧠 MANUAL
            </button>
            <button 
               onClick={() => {
                 const m = !isAudioMuted;
                 setIsAudioMuted(m);
                 setMuted(m);
                 if(!m) playBloop();
               }}
               className="hover:scale-105 transition-transform bg-gray-800 border border-gray-600 px-2 py-1 flex gap-2 items-center focus:outline-none"
               title="Boss Key"
            >
               {isAudioMuted ? "🔇 MUTE ON" : "🔊 MUTE OFF"}
            </button>

            {authPayload && (
              <>
                <span className="hidden sm:inline">TOKENS:</span>
                <span className="text-[#00B140] tracking-widest font-bold">UNLIMITED</span>
              </>
            )}
         </div>
      </div>

      <div className="crt-overlay"></div>
      
      {/* Animated Main Container */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-7xl mx-auto space-y-10 relative z-10"
      >
        
        {/* Error Display */}
        {errorLog && (
          <div className="bg-[#e52521] text-white p-6 retro-border shadow-[4px_4px_0_0_#000] mb-8 animate-pulse text-center flex flex-col md:flex-row items-center justify-center gap-4">
             <span className="font-pixel-heading text-lg md:text-xl uppercase" style={{ textShadow: "2px 2px 0 #000" }}>
               ⚠️ {errorLog} ⚠️
             </span>
             <button onClick={() => setErrorLog("")} className="bg-black text-white px-4 py-2 hover:bg-gray-800 transition-colors">
               CONTINUE?
             </button>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col items-center justify-center text-center pb-4 pt-8">
          <h1 className="text-3xl md:text-5xl font-pixel-heading text-white retro-shadow mb-6 text-shadow-xl glitch" data-text="S.M.A.S.H. MATCHER" style={{ textShadow: "4px 4px 0 #000" }}>
            S.M.A.S.H.<br className="md:hidden" /> MATCHER
          </h1>
          <div className="bg-black p-4 retro-border shadow-[4px_4px_0_0_#f8d820] max-w-2xl relative mb-4">
            <div className="absolute top-0 left-0 w-full h-full opacity-30" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, #333 2px, #333 4px)" }}></div>
            <p className="text-white text-[10px] md:text-xs leading-loose relative z-10" style={{ textShadow: "1px 1px 0 #000" }}>
              SELECT YOUR TARGETS, EQUIP THE BOSS LIST, AND LET THE AI CRUSH THE OVERLAP! NO MERCY 🍄
            </p>
          </div>
        </header>

        {/* Upload Cards */}
        <div className="grid md:grid-cols-2 gap-8 mt-10">
          
          {/* Target Box (Mushroom Power) */}
          <div className="bg-[#00B140] retro-border shadow-[8px_8px_0_0_#000] p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg md:text-xl font-pixel-heading text-white shadow-black mb-4" style={{ textShadow: "2px 2px 0 #000" }}>
                1. SUMMON TARGETS
              </h2>
              <p className="text-black mb-6 leading-loose text-[10px]">
                The hit-list. Max 500 fighters.
              </p>
            </div>
            
            <div 
              className="flex flex-col items-center justify-center w-full h-32 cartridge-slot cursor-pointer transition-all hover:brightness-110 active:brightness-90"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-active'); }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-active'); }}
              onDrop={(e) => { 
                e.preventDefault(); 
                e.currentTarget.classList.remove('drag-active');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const ev = { target: { files: e.dataTransfer.files } } as any;
                  handleTargetUpload(ev);
                }
              }}
              onClick={() => document.getElementById('target-upload')?.click()}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                {targetList.length > 0 ? (
                  <div className="text-center font-bold text-[#f8d820] flex flex-col items-center text-xs" style={{ textShadow: "2px 2px 0 #000" }}>
                    <span className="text-2xl mb-2">🍄</span>
                    {targetList.length.toLocaleString()} CARTRIDGE LOADED
                  </div>
                ) : (
                  <>
                    <span className="text-2xl mb-2">📥</span>
                    <span className="text-white leading-loose text-center px-4 text-[10px]" style={{ textShadow: "1px 1px 0 #000" }}>DRAG & DROP CSV/XLSX<br/>(OR CLICK TO BROWSE)</span>
                  </>
                )}
              </div>
              <input id="target-upload" type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={handleTargetUpload} disabled={isProcessing} />
            </div>
          </div>

          {/* Suppression Box (Bowser's Castle Brick) */}
          <div className="bg-[#E47041] retro-border shadow-[8px_8px_0_0_#000] p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg md:text-xl font-pixel-heading text-white mb-4" style={{ textShadow: "2px 2px 0 #000" }}>
                2. SUMMON BOSS LIST
              </h2>
              <p className="text-black mb-6 leading-loose text-[10px]">
                The massive suppression grid (100k+ rows).
              </p>
            </div>
            
            <div 
              className="flex flex-col items-center justify-center w-full h-32 cartridge-slot cursor-pointer transition-all hover:brightness-110 active:brightness-90"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-active'); }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-active'); }}
              onDrop={(e) => { 
                e.preventDefault(); 
                e.currentTarget.classList.remove('drag-active');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const ev = { target: { files: e.dataTransfer.files } } as any;
                  handleSuppUpload(ev);
                }
              }}
              onClick={() => document.getElementById('supp-upload')?.click()}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                {suppList.length > 0 ? (
                  <div className="text-center font-bold text-[#f8d820] flex flex-col items-center text-xs" style={{ textShadow: "2px 2px 0 #000" }}>
                    <span className="text-2xl mb-2">🔥</span>
                    {suppList.length.toLocaleString()} CARTRIDGE LOADED
                  </div>
                ) : (
                  <>
                    <span className="text-2xl mb-2">📥</span>
                    <span className="text-white leading-loose text-center px-4 text-[10px]" style={{ textShadow: "1px 1px 0 #000" }}>DRAG & DROP CSV/XLSX<br/>(OR CLICK TO BROWSE)</span>
                  </>
                )}
              </div>
              <input id="supp-upload" type="file" className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={handleSuppUpload} disabled={isProcessing} />
            </div>
          </div>

        </div>

        {/* Action Bar */}
        <div className="bg-[#f8d820] retro-border shadow-[8px_8px_0_0_#000] p-6 mt-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
          {/* subtle moving hazard strip background inside action bar */}
          <div className="absolute inset-0 opacity-10" style={{ background: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }}></div>
          
          <button
            onClick={handleStart}
            disabled={isProcessing || !targetList.length || !suppList.length}
            className={`relative z-10 w-full md:w-auto text-white py-5 px-10 retro-border shadow-[4px_4px_0_0_#000] font-pixel-heading text-sm md:text-lg lg:text-xl transition-all disabled:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600 retro-shadow-hover retro-shadow-active ${!isProcessing && targetList.length && suppList.length ? "bg-[#e52521] animate-pulse" : "bg-[#e52521]"}`}
          >
            {isProcessing ? "BRAWLING..." : "INSERT COIN & FIGHT!"}
          </button>
          
          <div className="flex-1 w-full relative h-[60px] retro-border bg-black z-10 flex flex-col">
            {isProcessing ? (
              <>
                <div 
                  className="absolute left-0 top-0 h-[30px] bg-[#00B140] transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
                <div className="absolute top-0 w-full h-[30px] flex items-center justify-between px-4 text-white text-[8px] md:text-[10px]" style={{ textShadow: "2px 2px 0 #000" }}>
                  <span>{progress.text}</span>
                  <span>{progress.percent}%</span>
                </div>
                
                {/* Ticker Box */}
                <div className="absolute bottom-0 w-full h-[30px] bg-gray-900 border-t-2 border-gray-700 overflow-hidden flex items-center z-20">
                   <div className="text-[#f8d820] text-[8px] md:text-[10px] font-pixel px-4 ticker whitespace-nowrap">
                     {tickerLog} &nbsp;&nbsp;&nbsp;&nbsp;+++&nbsp;&nbsp;&nbsp;&nbsp; {tickerLog}
                   </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#f8d820] text-[10px] md:text-[12px] font-pixel-heading animate-pulse">
                AWAITING KOMBATANTS...
              </div>
            )}
          </div>
        </div>

        {/* Embedded Waiting Minigame! */}
        {isProcessing && (
          <MiniGame percent={progress.percent} />
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white retro-border shadow-[8px_8px_0_0_#000] mt-12 mb-20 flex flex-col">
            
            {/* Vitory Summary Stats */}
            <div className="bg-[#000] text-white p-6 border-b-4 border-black font-pixel">
              <h3 className="text-xl md:text-2xl text-[#f8d820] mb-6 text-center glitch" data-text="K.O. MATCH SUMMARY">K.O. MATCH SUMMARY</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="bg-[#111] p-4 retro-border border-gray-600">
                  <div className="text-3xl text-[#00B140] mb-2">{calculateStats(results).flawless}</div>
                  <div className="text-[10px] text-gray-400">FLAWLESS INSTA-MATCHES</div>
                </div>
                <div className="bg-[#111] p-4 retro-border border-gray-600">
                  <div className="text-3xl text-yellow-500 mb-2">{calculateStats(results).aiRescues}</div>
                  <div className="text-[10px] text-gray-400">AI GEMINI RESCUES</div>
                </div>
                <div className="bg-[#111] p-4 retro-border border-gray-600">
                  <div className="text-3xl text-[#e52521] mb-2">{calculateStats(results).rejected}</div>
                  <div className="text-[10px] text-gray-400">FATAL REJECTIONS</div>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 border-b-4 border-black bg-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <h3 className="font-pixel-heading text-lg md:text-xl text-black uppercase" style={{ textShadow: "1px 1px 0 #fff" }}>
                BATTLE RESULTS
              </h3>
              <div className="flex gap-4">
                <button onClick={() => { playBloop(); setShowWarning("csv"); }} className="bg-[#f8d820] retro-border text-black px-4 py-3 shadow-[4px_4px_0_0_#000] transition-all hover:bg-yellow-300 retro-shadow-hover retro-shadow-active text-xs">
                  LOOT CSV
                </button>
                <button onClick={() => { playBloop(); setShowWarning("xlsx"); }} className="bg-[#00B140] retro-border text-white px-4 py-3 shadow-[4px_4px_0_0_#000] transition-all hover:bg-green-500 retro-shadow-hover retro-shadow-active text-xs">
                  LOOT EXCEL
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left bg-white text-[8px] sm:text-[9px] md:text-[10px] leading-loose">
                <thead className="bg-[#c84c0c] text-white">
                  <tr>
                    <th className="p-4 border-b-4 border-r-4 border-black font-normal whitespace-nowrap">Hit List</th>
                    <th className="p-4 border-b-4 border-r-4 border-black font-normal whitespace-nowrap">Opponent Match</th>
                    <th className="p-4 border-b-4 border-r-4 border-black font-normal whitespace-nowrap">Verdict</th>
                    <th className="p-4 border-b-4 border-r-4 border-black font-normal min-w-[300px]">Announcer Combat Log</th>
                    <th className="p-4 border-b-4 border-black font-normal whitespace-nowrap text-center">Stats / Source</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 100).map((r, i) => {
                    const best = r.matches[0];
                    if (!best) return (
                      <tr key={i} className="hover:bg-gray-100">
                        <td className="p-4 border-b-4 border-r-4 border-black font-bold uppercase truncate max-w-[150px]" title={r.input}>{r.input}</td>
                        <td className="p-4 border-b-4 border-r-4 border-black text-gray-500">NO OPPONENT FOUND</td>
                        <td className="p-4 border-b-4 border-r-4 border-black" colSpan={3}>
                           <span className="text-gray-400 italic">"SKIPPED! GHOST TOWN IN THE SUPPRESSION GRID!"</span>
                        </td>
                      </tr>
                    );

                    let verdictBg = "bg-white text-black";
                    if (best.relation === "same_company") verdictBg = "bg-[#00B140] text-white";
                    else if (best.relation === "same_group") verdictBg = "bg-blue-500 text-white";
                    else if (best.relation === "different") verdictBg = "bg-[#e52521] text-white";

                    return (
                      <tr key={i} className="hover:bg-yellow-100 transition-colors">
                        
                        <td className="p-4 border-b-4 border-r-4 border-black max-w-[150px] sm:max-w-[200px] truncate" title={r.input}>
                          {r.input}
                        </td>
                        
                        <td className="p-4 border-b-4 border-r-4 border-black max-w-[150px] sm:max-w-[200px] truncate" title={best.candidate}>
                          {best.candidate}
                        </td>
                        
                        <td className="p-4 border-b-4 border-r-4 border-black">
                          <div className="flex flex-col gap-2 items-start">
                             <div className={`px-2 py-2 retro-border shadow-[2px_2px_0_0_#000] ${verdictBg} uppercase`}>
                               {best.relation.replace("_", " ")}
                             </div>
                             
                             <div className={`px-2 py-2 retro-border shadow-[2px_2px_0_0_#000] bg-white text-black border-2 border-black w-fit uppercase`}>
                               LVL: {best.confidence}
                             </div>
                          </div>
                        </td>
                        
                        <td className="p-4 border-b-4 border-r-4 border-black italic font-bold" style={{ lineHeight: 1.8 }}>
                           "{best.verdict_log}"
                        </td>
                        
                        <td className="p-4 border-b-4 border-black text-center">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className="bg-black text-white px-2 py-2 uppercase inline-block outline outline-2 outline-gray-400 mb-2 whitespace-nowrap">
                              {best.source.replace(/_/g, " ")}
                            </div>
                            <div className="whitespace-nowrap">
                              FUZZ: <span className="text-[#e52521] font-bold">{(best.score * 100).toFixed(1)}%</span> |
                              MANA: <span className="text-blue-600 font-bold">{(best.overlap * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </td>
                        
                      </tr>
                    );
                  })}
                  
                  {results.length > 100 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-black bg-gray-200 uppercase font-bold tracking-widest border-b-4 border-black">
                        SHOWING FIRST 100. LOOT CSV/EXCEL FOR ALL {results.length.toLocaleString()} ROWS.
                      </td>
                    </tr>
                  )}
                  
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>

      {/* Download Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#e52521] p-6 max-w-lg w-full retro-border shadow-[12px_12px_0_0_#000] relative">
            <h2 className="text-white text-2xl font-pixel-heading mb-4 text-shadow-xl glitch" data-text="WARNING: AI DETECTED">WARNING: AI DETECTED</h2>
            <div className="bg-black p-4 text-white text-[10px] md:text-xs leading-loose retro-border border-white mb-6">
              <p className="mb-4">
                <strong>LISTEN UP, HUMAN:</strong> You deployed an artificial neural network to do your dirty work. Our AI "Bro" is smart, but sometimes he hallucinates like a 90s graphics card overheating.
              </p>
              <p className="text-[#f8d820]">
                By downloading this loot, you agree that you are solely responsible for fact-checking the AI's savage verdicts before submitting them to your boss! USE AT YOUR OWN RISK!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                className="flex-1 bg-white text-black py-4 retro-border transition-transform active:translate-y-1 shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000]"
                onClick={() => { playBloop(); setShowWarning(null); }}
              >
                NEVERMIND
              </button>
              <button 
                className="flex-1 bg-[#f8d820] text-black py-4 retro-border transition-transform active:translate-y-1 shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000] font-bold"
                onClick={() => { 
                  playFight();
                  setShowLootChest(true);
                }}
              >
                GIMME THE LOOT!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loot Chest Anim Screen */}
      {showLootChest && (
         <LootChest onUnlock={() => {
            if (showWarning) exportResults(results, showWarning);
            setShowLootChest(false);
            setShowWarning(null);
         }} />
      )}

      {/* Brain Manual Modal */}
      {showBrainManual && (
         <BrainManualModal 
            onClose={() => setShowBrainManual(false)} 
            playBloop={playBloop} 
         />
      )}

      {/* Auth Gate Modal */}
      {showAuthGate && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#00B140] p-6 max-w-lg w-full retro-border shadow-[12px_12px_0_0_#000] relative">
            <h2 className="text-white text-2xl font-pixel-heading mb-4 text-shadow-xl" style={{ textShadow: "4px 4px 0px #000" }}>SECURITY GATE</h2>
            <div className="bg-black p-4 text-white text-[10px] md:text-xs leading-loose retro-border border-white mb-6 text-center">
              <p className="mb-4 text-[#f8d820]">VERIFY CLEARANCE LEVEL</p>
              
              <div className="flex flex-col md:flex-row gap-4 justify-center mb-6">
                 <button 
                   onClick={() => { playBloop(); setAuthMode("key"); }}
                   className={`p-2 transition-all border-b-4 ${authMode === "key" ? "text-white border-white" : "text-gray-600 border-transparent hover:text-gray-400"}`}
                 >
                   CUSTOM API KEY
                 </button>
                 <button 
                   onClick={() => { playBloop(); setAuthMode("password"); }}
                   className={`p-2 transition-all border-b-4 ${authMode === "password" ? "text-white border-white" : "text-gray-600 border-transparent hover:text-gray-400"}`}
                 >
                   ADMIN PASSWORD
                 </button>
              </div>

              <input 
                 type={authMode === "password" ? "password" : "text"}
                 className="w-full bg-gray-900 border-4 border-gray-600 text-[#00B140] p-4 font-pixel text-xs text-center outline-none focus:border-white mb-2"
                 placeholder={authMode === "password" ? "ENTER OVERRIDE CODE" : "ENTER YOUR GEMINI API KEY"}
                 value={authInput}
                 onChange={e => setAuthInput(e.target.value)}
                 onKeyDown={e => e.key === "Enter" && handleAuthSubmit()}
              />
              <p className="text-gray-500 text-[8px] mt-2">
                 {authMode === "key" ? (
                   <>
                     Need a key? Get one free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Google AI Studio</a>.
                   </>
                 ) : "Note: Admin override uses the secure server-side master key and includes full Search Grounding."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                className="flex-1 bg-white text-black py-4 retro-border transition-transform active:translate-y-1 shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000]"
                onClick={() => { playBloop(); setShowAuthGate(false); setAuthInput(''); }}
              >
                ABORT
              </button>
              <button 
                className="flex-1 bg-[#f8d820] text-black py-4 retro-border transition-transform active:translate-y-1 shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000] font-bold"
                onClick={handleAuthSubmit}
              >
                AUTHORIZE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credits Footer */}
      <footer className="w-full text-center py-8 relative z-10">
        <p className="text-white font-pixel text-[10px]" style={{ textShadow: "1px 1px 0 #000" }}>
          ENGINEERED BY <span className="text-[#f8d820] glitch" data-text="PJA">PJA</span>
        </p>
      </footer>

    </div>
  );
}


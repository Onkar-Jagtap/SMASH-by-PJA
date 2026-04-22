import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onClose: () => void;
  playBloop: () => void;
}

export function BrainManualModal({ onClose, playBloop }: Props) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 md:p-8 backdrop-blur-sm overflow-y-auto">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-[#222] p-2 md:p-8 max-w-4xl w-full retro-border shadow-[12px_12px_0_0_#000] relative max-h-[90vh] overflow-y-auto"
        >
          {/* Close Button */}
          <button 
            onClick={() => { playBloop(); onClose(); }}
            className="absolute top-2 right-2 md:top-4 md:right-4 bg-[#e52521] text-white w-8 h-8 md:w-10 md:h-10 retro-border flex items-center justify-center hover:bg-red-400 active:translate-y-1 shadow-[4px_4px_0_0_#000] active:shadow-[0_0_0_0_#000] text-xl md:text-2xl font-bold z-10"
          >
            X
          </button>

          <h1 className="text-white text-2xl md:text-4xl font-pixel-heading mb-8 text-shadow-xl border-b-4 border-gray-600 pb-4 text-center" style={{ textShadow: "4px 4px 0px #000" }}>
            🧠 THE BRAIN & MANUAL
          </h1>

          <div className="space-y-8 font-pixel text-[10px] md:text-xs leading-loose">

            <section className="bg-black p-6 retro-border border-white shadow-[4px_4px_0_0_#00B140]">
              <h2 className="text-[#00B140] text-xl font-pixel-heading mb-4 border-b-2 border-[#00B140] pb-2">HOW THE AI BRAIN WORKS</h2>
              <div className="text-gray-300 space-y-4">
                <p>The S.M.A.S.H. Engine uses a hybrid cascading algorithm. We don&apos;t just throw everything at the AI (that wastes tokens and time).</p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li><strong className="text-white">Deterministic Filter:</strong> Instantly catches exact matches, token-for-token matches, and known conglomerate parent/subsidiary maps.</li>
                  <li><strong className="text-[#f8d820]">Generic Shield:</strong> Blocks noisy matches! If two companies ONLY share words like &quot;Group&quot;, &quot;Technology&quot;, &quot;Solutions&quot;, the engine kills it before the AI even sees it.</li>
                  <li><strong className="text-[#e52521]">Industry Conflict:</strong> Blocks cross-industry false positives (e.g., auto vs banking).</li>
                  <li><strong className="text-blue-400">The AI Arena:</strong> Surviving candidates above a 45% fuzzy overlap are sent to Gemini Flash.</li>
                  <li><strong className="text-purple-400">Search Grounding:</strong> The AI utilizes Google Search to verify real-world legal entity relationships before pronouncing a final 1-sentence Savage Announcer Verdict.</li>
                </ol>
              </div>
            </section>

            <section className="bg-black p-6 retro-border border-white shadow-[4px_4px_0_0_#e52521]">
              <h2 className="text-[#e52521] text-xl font-pixel-heading mb-4 border-b-2 border-[#e52521] pb-2">POSSIBLE ERRORS & FIXES</h2>
              <div className="space-y-6">
                
                <div className="border-l-4 border-gray-600 pl-4">
                  <h3 className="text-white font-bold mb-2">❌ ERROR: &quot;API_KEY_INVALID&quot; / UNAUTHORIZED</h3>
                  <p className="text-gray-400"><strong>The Problem:</strong> Google rejected the AI Studio Key.</p>
                  <p className="text-[#f8d820]"><strong>The Fix:</strong> Check for typos! Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>, generate a fresh API key, and paste it carefully without quotes or spaces.</p>
                </div>

                <div className="border-l-4 border-gray-600 pl-4">
                  <h3 className="text-white font-bold mb-2">⚡ OPTIMIZED THROTTLE: &quot;BALANCED SPEED&quot; MODE</h3>
                  <p className="text-gray-400"><strong>The Strategy:</strong> To maximize speed on the Free Tier, the engine now uses a tighter 2.5-second cooldown and enhanced deterministic laws that &quot;auto-verify&quot; common patterns without calling the AI.</p>
                  <p className="text-[#00B140]"><strong>The Benefit:</strong> You get results roughly 40% faster than the previous mode while remaining safely under the 15-RPM quota shadow.</p>
                </div>

                <div className="border-l-4 border-gray-600 pl-4">
                  <h3 className="text-[#00B140] font-bold mb-2">ℹ️ INFO: WHAT IS ADMIN BYPASS MODE?</h3>
                  <p className="text-gray-400"><strong>The Reason:</strong> Admin Mode securely uses the API key mounted directly on the backend server. By default, it uses a restricted Free Tier container key (which does NOT support Google Search Grounding to avoid crashes).</p>
                  <p className="text-[#f8d820]"><strong>The Pro-Unlock:</strong> To unlock full power on Admin Mode without pasting keys in the UI, go to AI Studio Settings -&gt; Keys & Secrets, and define a <code className="bg-[#555] px-1 rounded text-white">CUSTOM_ADMIN_API_KEY</code> variable with your Paid Tier key. This cleanly unlocks unlimited file matching and Google Search validation across the backend for Admin users!</p>
                </div>

                <div className="border-l-4 border-gray-600 pl-4">
                  <h3 className="text-white font-bold mb-2">❌ ERROR: FALSE POSITIVES ON GROUPS</h3>
                  <p className="text-gray-400"><strong>The Problem:</strong> "XYZ Group" matches "ABC Group" because of the weak word "Group".</p>
                  <p className="text-[#f8d820]"><strong>The Fix:</strong> This is dynamically mitigated by the <strong>Generic Shield</strong> in the deterministic phase. Ensure Brazilian/Portuguese generic terms (e.g., &quot;Participações&quot;) are filtered. Added in v1.5.</p>
                </div>
                
                <div className="border-l-4 border-gray-600 pl-4">
                  <h3 className="text-white font-bold mb-2">❌ ERROR: UPLOAD FREEZES / MISSING DATA</h3>
                  <p className="text-gray-400"><strong>The Problem:</strong> The XLSX or CSV parser threw an exception on messy data.</p>
                  <p className="text-[#f8d820]"><strong>The Fix:</strong> Make sure your file has a clear 1-column list of companies or a column explicitly labeled &quot;Company&quot;, &quot;Name&quot;, or &quot;Client&quot;.</p>
                </div>

              </div>
            </section>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

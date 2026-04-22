# S.M.A.S.H. MATCHER CONVENTIONS

This document serves as the project's permanent brain and memory for the AI.

## Project Structure
- `src/App.tsx`: Main React UI, holds the state for lists, processing, and the retro gaming theme. Includes `BrainManualModal.tsx` for error tracking and logic explanation.
- `src/lib/engine.ts`: The core "AI Engine" logic. Contains the heavily optimized deterministic rules (Token matching, Generic Shields, Industry Conflict detection) and the quota-managed Gemini query mechanism.
- `server.ts`: The Express backend that wraps the `@google/genai` sdk. Parses the logic prompt using a "Arcade Announcer" persona.

## The Hybrid "Cascading" Engine Approach
Do not alter this fundamental architecture without strong reasoning:
1.  **Index/Lookup Phase:** Generates a pool of candidates.
2.  **Deterministic Rules (Fast/Cheap/Safe):**
    *   **Generic Shield:** Kills matches where tokens are completely generic (e.g. "Tech" vs "IT").
    *   **Token Overlap / Exact Match:** Matches exact strings or 100% token subsets.
    *   **Industry Conflict:** Kills matches where the baseline industries are violently different.
3.  **The AI Arena:** Remaining complex fuzzy matches are queried to Gemini using Structured Output and `googleSearch` grounding.

## Possible Errors & Immediate Fixes

1.  **`API_KEY_INVALID` or `401 Unauthorized`:**
    *   *Symptom:* The engine crashes immediately upon calling the AI or entering retry loop.
    *   *Fix:* Ensure the frontend `fetchWithRetry` catches this 401 code and `server.ts` maps `API_KEY_INVALID` (from the google/genai package) to exactly 401, breaking the retry loop to avoid quota burns or infinite hangs.
2.  **`429 Too Many Requests` (Quota Exhausted):**
    *   *Symptom:* The AI stops returning responses.
    *   *Fix:* The Engine intercepts API failures and employs a "Blind Conservative Heuristic" as a fallback, gracefully letting the user's workload finish.
3.  **Main Thread Starving (Animation Freezing):**
    *   *Symptom:* The falling bugs in `MiniGame.tsx` stop or jitter when the engine is running.
    *   *Fix:* Ensure `requestAnimationFrame` with delta time loops is used over `setInterval`. Always offload engine data-crunching to the web worker.
4.  **False Positives on Generic Tokens (e.g., "ABCD Group" == "WXYZ Group"):**
    *   *Fix:* Extend `GENERIC_TOKENS` in `engine.ts` with any newly identified weak words. The `applyDeterministicRules` block uses this list to deploy the "Generic Shield".

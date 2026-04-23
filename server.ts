import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Check if server is already equipped with a Master Key (BYOK Support)
  app.get("/api/config", (req, res) => {
    const rawKey = process.env.CUSTOM_ADMIN_API_KEY || process.env.GEMINI_API_KEY;
    const cleanKey = rawKey ? rawKey.replace(/['"\s]/g, "") : "";
    // Only count as having a key if it's not a generic placeholder
    const isValid = cleanKey && cleanKey.length > 20 && !cleanKey.includes("YOUR_API_KEY");
    res.json({ hasMasterKey: !!isValid });
  });

  // API Route for AI Verification
  app.post("/api/verify-match", async (req, res) => {
    try {
      const { input, candidate, ni, nc, score, overlap, authPayload, otherCandidates } = req.body;

      let ai: GoogleGenAI;
      let toolsConfig: any[] | undefined = undefined;

      // Clean extract for env keys (handles accidental quotes/spaces/newlines in environment setup)
      const getEnvKey = (key?: string) => key ? key.replace(/[^a-zA-Z0-9_\-]/g, "").trim() : null;
      const masterKey = getEnvKey(process.env.CUSTOM_ADMIN_API_KEY) || getEnvKey(process.env.GEMINI_API_KEY);

      // AUTHENTICATION & KEY RESOLUTION
      if (authPayload?.type === "password" && authPayload?.value === "@$#Pja123") {
        // ADMIN MODE: Uses master server key with full Search Grounding
        if (!masterKey) throw new Error("Server missing master API key in environment settings.");
        ai = new GoogleGenAI({ apiKey: masterKey });
        toolsConfig = [{ googleSearch: {} }];
      } else if (authPayload?.type === "key" && authPayload?.value) {
        // BYOK MODE: Uses user-provided key from the UI with full Search Grounding
        const customKey = authPayload.value.replace(/[^a-zA-Z0-9_\-]/g, "").trim(); 
        ai = new GoogleGenAI({ apiKey: customKey });
        toolsConfig = [{ googleSearch: {} }];
      } else if (masterKey) {
        // PUBLIC/APP KEY MODE: Falls back to the master key if provided via BYOK
        // This allows the app to work if the user has provided a key but no password.
        ai = new GoogleGenAI({ apiKey: masterKey });
        toolsConfig = undefined; // Search disabled for public use to conserve quota
      } else {
        return res.status(401).json({ error: "UNAUTHORIZED: Clearance Required. Provide a Custom API Key or Admin Password." });
      }

      const contextStr = (otherCandidates && otherCandidates.length > 0) 
        ? `\nContext: Input "${input}" also partially matched with secondary candidates: ${otherCandidates.join(", ")}. This helps you decide if "${candidate}" is truly the same entity or if they are separate entities competing in the same space.` 
        : "";

      const userPrompt = `Fighter A: "${input}" (Normalized: "${ni}")
Fighter B: "${candidate}" (Normalized: "${nc}")
Power (Fuzzy Score): ${(score * 100).toFixed(1)}%
Mana (Token Overlap): ${(overlap * 100).toFixed(1)}%
${contextStr}

Determine if these represent the same company, same group, or completely different entities! Give a savage arcade announcer verdict!`;

      const systemInstruction = `You are the brutal announcer of S.M.A.S.H. MATCHER (an 8-bit retro fighting game for corporate entity resolution).
You have access to Google Search. You must use it if you are unsure if two companies are actually the same legal entity or if one is a subsidiary of the other.

Rules:
- same_company ONLY if clearly the exact same legal entity (same brand, abbreviation) in the real world.
- same_group ONLY if a VERY well-known parent/subsidiary relationship (use Search to verify if needed).
- CRITICAL EDGE CASE: If two combatants share a HIGHLY UNIQUE base name (e.g. "Zendesk IT" vs "Zendesk Technology"), classify as same_group or same_company.
- CRITICAL EDGE CASE: If they share a VERY GENERIC base name (e.g. "Global IT" vs "Global Tech"), classify as DIFFERENT. Independent companies share weak generic words.
- If ANY doubt AFTER SEARCH -> return "different".
- Shared industry words are NOT evidence.
- Your 'verdict_log' must be a savage, 1-short-sentence arcade game announcer shout explaining your reason, including confirming if Search proved it!`;

      // Server-side retry logic to handle upstream 429s gracefully
      let result;
      let lastError;
      const isAdminMode = authPayload?.type === "password" && authPayload?.value === "@$#Pja123";
      
      if (isAdminMode && !process.env.CUSTOM_ADMIN_API_KEY) {
        console.warn("[SERVER] ADMIN MODE: No CUSTOM_ADMIN_API_KEY found, falling back to shared key.");
      }

      const retryAttempts = 5; // Increased for enterprise stability
      for (let i = 0; i < retryAttempts; i++) {
        try {
          // If we reach the final attempt and still failing, try disabling tools to bypass potential resource constraints
          const currentTools = (i === retryAttempts - 1) ? undefined : toolsConfig;
          
          const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: userPrompt,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.1, // Even lower for more consistency
              tools: currentTools,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  relation: {
                    type: Type.STRING,
                    enum: ["same_company", "same_group", "different"],
                    description: "The relationship between the two companies."
                  },
                  confidence: {
                    type: Type.STRING,
                    enum: ["high", "medium", "low"],
                    description: "Your confidence in the relationship."
                  },
                  verdict_log: {
                    type: Type.STRING,
                    description: "A savage, 8-bit retro gaming announcer shout explaining the verdict in 1 short sentence."
                  }
                },
                required: ["relation", "confidence", "verdict_log"]
              }
            }
          });
          result = response;
          break;
        } catch (err: any) {
          lastError = err;
          const msg = err?.message?.toLowerCase() || "";
          
          // Resource Exhausted / Quota / Throttling
          if (msg.includes("429") || msg.includes("quota") || msg.includes("limit") || msg.includes("resource_exhausted") || err?.status === "RESOURCE_EXHAUSTED") {
            const backoff = (Math.pow(2, i) * 2000) + (Math.random() * 1000); // Exponential backoff with jitter
            console.warn(`[SERVER UPSTREAM] 429 Quota hit (Attempt ${i+1}/${retryAttempts}). Backoff: ${Math.round(backoff)}ms. (Admin: ${isAdminMode})`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          // If the error is related to tools/search being unavailable for this particular key
          if (msg.includes("tool") || msg.includes("search") || msg.includes("invalid argument")) {
            console.warn("[SERVER UPSTREAM] AI Tools failed or unsupported. Retrying without tools...");
            toolsConfig = undefined; // Permanently disable for this request cycle
            continue;
          }

          throw err;
        }
      }

      if (!result) throw lastError;

      const text = result.text;
      if (!text) {
        throw new Error("Empty response from Gemini.");
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error("[AI Verification Error]:", error?.message || error);
      const errMsg = error?.message?.toLowerCase() || "";
      if (errMsg.includes("api key not valid") || errMsg.includes("api_key_invalid")) {
         return res.status(401).json({ error: "API_KEY_INVALID", details: "The API key you provided was rejected by Google. Please check for typos and ensuring it's for the Gemini API." });
      }
      const isQuota = errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("resource_exhausted") || error?.status === "RESOURCE_EXHAUSTED";
      res.status(isQuota ? 429 : 500).json({ error: "Verification failed.", details: error?.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

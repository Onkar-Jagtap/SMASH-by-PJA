import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for AI Verification
  app.post("/api/verify-match", async (req, res) => {
    try {
      const { input, candidate, ni, nc, score, overlap, authPayload } = req.body;

      let ai: GoogleGenAI;
      if (authPayload?.type === "password" && authPayload?.value === "@$#Pja123") {
        if (!process.env.GEMINI_API_KEY) throw new Error("Server missing default API key.");
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      } else if (authPayload?.type === "key" && authPayload?.value) {
        ai = new GoogleGenAI({ apiKey: authPayload.value });
      } else {
        return res.status(401).json({ error: "Unauthorized. Invalid Password or API Key." });
      }

      const userPrompt = `Fighter A: "${input}" (Normalized: "${ni}")
Fighter B: "${candidate}" (Normalized: "${nc}")
Power (Fuzzy Score): ${(score * 100).toFixed(1)}%
Mana (Token Overlap): ${(overlap * 100).toFixed(1)}%

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

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2,
          tools: [{ googleSearch: {} }],
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

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini.");
      }

      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error: any) {
      console.error("[AI Verification Error]:", error?.message || error);
      res.status(500).json({ error: "Verification failed.", details: error?.message });
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

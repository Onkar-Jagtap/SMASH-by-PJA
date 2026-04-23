import { GoogleGenAI } from "@google/genai";

// ==============================================================================
// CMIP MATCHING ENGINE
// ==============================================================================

const CHUNK_SIZE = 10; // Smaller chunks for smoother UI and better rate control
const MIN_SCORE = 0.35;
const MAX_MATCHES = 5;
const AI_BUDGET_PCT = 1.0;
const MAX_CANDIDATES = 2000;
const AI_MIN_SCORE = 0.65;
const AI_MIN_OVERLAP = 0.50;

const LEGAL_SUFFIX_RE = /\b(ltd|limited|pvt|private|inc|llc|corp|corporation|plc|co|company|sa|s\.a|s\/a|ltda|s\.a\.|eireli|me|epp|mei)\b\.?/gi;
const CAMEL_SPLIT_1 = /([a-z])([A-Z])/g;
const CAMEL_SPLIT_2 = /([A-Z]+)([A-Z][a-z])/g;
const FEFF_RE = /^\uFEFF/;
const AMP_RE = /[&]/g;
const NON_ALPHANUM_RE = /[^\w\s]/g;
const WHITESPACE_RE = /\s+/g;
const ACCENT_RE = /[\u0300-\u036f]/g;
const SA_PRE_RE = /\bs\.?\/?a\.?\b/gi;

const WEAK_TOKENS: Set<string> = new Set([
  "and", "the", "of", "in", "at", "for", "to", "a", "an", "is", "by", "or", "on", "as",
  "de", "la", "le", "van", "von", "el", "al", "du", "das", "der", "die", "da", "do", "e", "em", "para", "com", "&",
  "s", "a",
]);

const ABBREV_MAP: Record<string, string> = {
  "tcs": "tata consultancy services", "ibm": "international business machines",
  "hcl": "hindustan computers limited", "ge": "general electric", "gm": "general motors",
  "hp": "hewlett packard", "ms": "microsoft", "jpm": "jp morgan",
  "boa": "bank of america", "baml": "bank of america merrill lynch",
  "pwc": "pricewaterhousecoopers", "ey": "ernst young",
  "kpmg": "klynveld peat marwick goerdeler", "pg": "procter gamble",
  "jnj": "johnson johnson", "3m": "minnesota mining manufacturing",
  "att": "american telephone telegraph", "bt": "british telecom",
  "sbi": "state bank india", "hdfc": "housing development finance corporation",
  "icici": "industrial credit investment corporation india", "lic": "life insurance corporation",
  "acn": "accenture", "csco": "cisco systems", "orcl": "oracle", "msft": "microsoft",
  "googl": "google alphabet", "amzn": "amazon", "nvda": "nvidia", "intc": "intel",
  "crm": "salesforce", "adbe": "adobe systems", "infy": "infosys", "wip": "wipro",
  "hcltech": "hcl technologies", "ctsh": "cognizant technology solutions",
  "capg": "capgemini", "dtt": "deloitte touche tohmatsu",
  "sap": "sap systems applications products", "l&t": "larsen toubro",
  "lt": "larsen toubro", "bpcl": "bharat petroleum corporation",
  "hpcl": "hindustan petroleum corporation", "ongc": "oil natural gas corporation",
  "ntpc": "national thermal power corporation", "coal": "coal india",
  "itau": "itau unibanco", "bradesco": "banco bradesco", "bb": "banco brasil",
  "btg": "btg pactual", "xp": "xp investimentos",
  "s.a.": " ", "sa": " ", "ltda": " ", "eireli": " ", "mei": " ", "me": " ", "epp": " ", "s/a": " "
};

const INDUSTRY_CLUSTERS = [
  ["motors", "automotive", "vehicles", "automobile"],
  ["steel", "metals", "mining", "iron"],
  ["bank", "banking", "finance", "financial", "lender"],
  ["pharma", "pharmaceutical", "drug", "biotech", "medicine", "healthcare"],
  ["consulting", "advisory", "management"],
  ["manufacturing", "factory", "industrial", "production"],
  ["energy", "oil", "gas", "petroleum", "refinery", "power"],
  ["retail", "ecommerce", "store", "supermarket", "grocery"],
  ["insurance", "reinsurance", "underwriter", "vida", "previdencia", "previdência"],
  ["bet", "betting", "apostas", "casino", "gaming"],
  ["aviation", "airline", "aerospace", "aircraft", "airport"],
  ["hotel", "hospitality", "restaurant", "catering", "tourism"],
  ["education", "university", "school", "college", "academy"],
  ["real estate", "property", "realty", "developer", "housing"],
];

const CONGLOMERATE_MAP: Record<string, string | null> = {
  "tata": "tata_group", "reliance": "reliance_group", "bajaj": "bajaj_group",
  "mahindra": "mahindra_group", "adani": "adani_group", "birla": "aditya_birla_group",
  "godrej": "godrej_group", "wipro": "wipro_group", "samsung": "samsung_group",
  "hyundai": "hyundai_group", "amazon": "amazon_group", "google": "alphabet_group",
  "alphabet": "alphabet_group", "meta": "meta_group", "facebook": "meta_group",
  "microsoft": "microsoft_group", "sony": "sony_group", "lg": "lg_group",
  "hitachi": "hitachi_group", "siemens": "siemens_group", "bosch": "bosch_group",
  "shell": "shell_group", "bp": "bp_group", "larsen": "larsen_toubro_group",
  "toubro": "larsen_toubro_group", "essar": "essar_group", "jindal": "jindal_group",
  "jsw": "jsw_group", "hindalco": "aditya_birla_group", "grasim": "aditya_birla_group",
  "ultratech": "aditya_birla_group", "infra": null, "vedanta": "vedanta_group",
  "sterlite": "vedanta_group", "suzuki": "maruti_suzuki_group", "maruti": "maruti_suzuki_group",
  "honda": "honda_group", "toyota": "toyota_group", "ford": "ford_group",
  "volkswagen": "volkswagen_group", "audi": "volkswagen_group", "skoda": "volkswagen_group",
  "porsche": "volkswagen_group", "nestle": "nestle_group", "unilever": "unilever_group",
  "stellantis": "stellantis_group", "peugeot": "stellantis_group", "fiat": "stellantis_group",
  "citroen": "stellantis_group", "chrysler": "stellantis_group", "jeep": "stellantis_group",
  "grupo": null,
};

// Caches
export const caches = { normCache: new Map(), matchResultCache: new Map(), aiCache: new Map<string, any>() };

// Load cache from session to save tokens
if (typeof localStorage !== "undefined") {
  try {
    const saved = localStorage.getItem("smash_ai_cache_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.entries(parsed).forEach(([k, v]) => caches.aiCache.set(k, v));
    }
  } catch(e) {
    console.warn("Failed to load AI cache");
  }
}

function persistCache() {
  if (typeof localStorage !== "undefined") {
    try {
      const obj = Object.fromEntries(caches.aiCache.entries());
      localStorage.setItem("smash_ai_cache_v1", JSON.stringify(obj));
    } catch(e) {}
  }
}

const GENERIC_TOKENS: Set<string> = new Set([
  "technologies", "tech", "technology", "info", "information", "solutions", "group", "holdings", "systems",
  "services", "enterprises", "international", "industries", "consulting", "consultoria",
  "management", "partners", "ventures", "capital", "network", "networks",
  "media", "financial", "digital", "global", "corporation", "communications",
  "software", "logistics", "tecnologias", "tecnologia", "solucoes", "soluções",
  "grupo", "sistema", "sistemas", "servicos", "serviços", "participacoes", "participações",
  "comercio", "industria", "educacao", "educação", "turismo", "brasil", "brazil", "agencia", "oficial",
  "instituto", "nacional", "sul", "norte", "leste", "oeste", "centro", "tecnologico", "tecnológico",
  "ingressos", "eventos", "empreendimentos", "distribuidora", "distribucao", "comercial", "industrial",
  "investimentos", "assessoria", "representacoes", "representações",
  "limitada", "gestion", "inversiones", "socios", "numerique", "gestion", "groupe", "systemes",
  "limitee", "lösungen", "gmbh", "dienstleistungen", "verwaltung", "kapital", "investitionen",
  "holdings", "company", "companies", "limited", "incorporated", "enterprise", "associates"
]);

function normalizeName(raw: string) {
  if (!raw || typeof raw !== "string") return "";
  const key = raw;
  if (caches.normCache.has(key)) return caches.normCache.get(key);

  let n = raw.normalize("NFD").replace(ACCENT_RE, ""); // Strip accents FIRST
  n = n.replace(CAMEL_SPLIT_1, "$1 $2").replace(CAMEL_SPLIT_2, "$1 $2"); // Split camelCase
  n = n.toLowerCase().trim();
  n = n.replace(FEFF_RE, "");
  n = n.replace(SA_PRE_RE, " ");
  n = n.replace(AMP_RE, " and ");
  n = n.replace(NON_ALPHANUM_RE, " ");
  n = n.replace(LEGAL_SUFFIX_RE, " ");
  n = n.replace(WHITESPACE_RE, " ").trim();
  n = n.split(" ").map(t => ABBREV_MAP[t] || (t === "it" ? "information technology" : t)).join(" ");
  n = n.replace(WHITESPACE_RE, " ").trim();
  caches.normCache.set(key, n);
  return n;
}

function tokenize(name: string): string[] {
  return normalizeName(name)
    .split(" ")
    .map(t => t.trim())
    .filter(t => t.length >= 1 && !WEAK_TOKENS.has(t));
}

function tokenOverlap(a: string, b: string) {
  const ta = new Set<string>(tokenize(a));
  const tb = new Set<string>(tokenize(b));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

function lev(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function charRatio(a: string, b: string) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length));
}

function computeScore(input: string, candidate: string) {
  const tokenSetRatio = (a: string, b: string) => {
    const ta = new Set<string>(tokenize(a)), tb = new Set<string>(tokenize(b));
    if (!ta.size && !tb.size) return 1;
    if (!ta.size || !tb.size) return 0;
    const inter = [...ta].filter(t => tb.has(t)).sort();
    const onlyA = [...ta].filter(t => !tb.has(t)).sort();
    const onlyB = [...tb].filter(t => !ta.has(t)).sort();
    const s1 = inter.join(" ");
    const s2 = [...inter, ...onlyA].join(" ");
    const s3 = [...inter, ...onlyB].join(" ");
    return Math.max(charRatio(s1, s2), charRatio(s1, s3), charRatio(s2, s3));
  };
  const tokenSortRatio = (a: string, b: string) => {
    return charRatio(tokenize(a).sort().join(" "), tokenize(b).sort().join(" "));
  }

  const na = normalizeName(input), nb = normalizeName(candidate);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(
    tokenSetRatio(input, candidate),
    tokenSortRatio(input, candidate),
    tokenSetRatio(na, nb),
    tokenSortRatio(na, nb),
  );
}

function applyDeterministicRules(input: string, candidate: string) {
  const ni = normalizeName(input), nc = normalizeName(candidate);
  
  // 1. Generic Shield: If the ONLY words they share are generic words, KILL the match instantly.
  // Example: "Grupo A" vs "Grupo IN" -> only share "Grupo", which is generic -> KILL.
  // Example: "A+ Tecnologia" vs "Luby Tecnologia" -> only share "Tecnologia", which is generic -> KILL.
  // Exception: if both strings ONLY consist of generic tokens, don't apply this block as they might actually be a match
  const taSet = new Set<string>(tokenize(input));
  const tbSet = new Set<string>(tokenize(candidate));
  const sharedTokens = [...taSet].filter(t => tbSet.has(t));
  const hasStrongSharedTokens = sharedTokens.some(t => !GENERIC_TOKENS.has(t));
  
  if (taSet.size === 0 || tbSet.size === 0) return null; // If input is purely punctuation/noise
  
  const aHasStrong = [...taSet].some(t => !GENERIC_TOKENS.has(t));
  const bHasStrong = [...tbSet].some(t => !GENERIC_TOKENS.has(t));

  if (sharedTokens.length > 0 && !hasStrongSharedTokens && (aHasStrong || bHasStrong)) {
     // However, ensure they aren't actually acronyms or single characters masquerading as similar (like A+ and A)
     const cleanA = tokenize(input).filter(t => !GENERIC_TOKENS.has(t)).join("");
     const cleanB = tokenize(candidate).filter(t => !GENERIC_TOKENS.has(t)).join("");
     
     // If the specific names are wildly different (A vs IN) block it. If they are very similar (A+ vs A) allow it to continue to AI.
     if (charRatio(cleanA, cleanB) < 0.6) {
        return { relation: "different", confidence: "high", source: "generic_override", verdict_log: "GENERIC WORD SHIELD DEPLOYED! NAMES ONLY SHARE NOISE!" };
     }
  }

  if (ni && nc && ni === nc) return { relation: "same_company", confidence: "very_high", source: "exact_match", verdict_log: "FLAWLESS VICTORY! PERFECT EXACT MATCH!" };
  
  const ta = tokenize(input).filter(t => !WEAK_TOKENS.has(t));
  const tb = tokenize(candidate).filter(t => !WEAK_TOKENS.has(t));
  if (ta.length > 0 && ta.length === tb.length) {
    const setB = new Set(tb);
    if (ta.every(t => setB.has(t))) {
      return { relation: "same_company", confidence: "very_high", source: "token_match", verdict_log: "C-C-C-COMBO! 100% TOKEN MATCH!" };
    }
  }

  const getConglomerateGroup = (n: string) => {
    for (const tok of tokenize(n)) if (CONGLOMERATE_MAP[tok]) return CONGLOMERATE_MAP[tok];
    return null;
  }
  const groupA = getConglomerateGroup(input);
  const groupB = getConglomerateGroup(candidate);
  if (groupA && groupB && groupA === groupB) {
    return { relation: "same_group", confidence: "high", source: "conglomerate_match", verdict_log: "BLOODLINE DETECTED! SAME CONGLOMERATE CLAN!" };
  }

  // 4. Parent Brand Detection (High Accuracy - Hardened for Global Use)
  // Example: "Serasa Experian" vs "Serasa" or "Apple India" vs "Apple"
  const stTokensA = [...taSet].filter(t => !GENERIC_TOKENS.has(t));
  const stTokensB = [...tbSet].filter(t => !GENERIC_TOKENS.has(t));
  if ((stTokensA.length === 1 || stTokensB.length === 1) && sharedTokens.length > 0) {
    const mainToken = stTokensA.length === 1 ? stTokensA[0] : stTokensB[0];
    // Safety check: The main brand token cannot be a generic word like "Solutions" or "Group"
    // And it must be long enough or a known brand to avoid common 3-char clashes (like "BTG" vs "BTG Tech")
    if (sharedTokens.includes(mainToken) && (mainToken.length >= 4 || (mainToken.length === 3 && !WEAK_TOKENS.has(mainToken))) && !GENERIC_TOKENS.has(mainToken)) {
      const otherSet = stTokensA.length === 1 ? tbSet : taSet;
      const leftovers = [...otherSet].filter(t => t !== mainToken && !GENERIC_TOKENS.has(t));
      if (leftovers.length === 0) {
        return { relation: "same_company", confidence: "high", source: "parent_brand_match", verdict_log: "PARENT BRAND DETECTED! STRONG UNIQUE TOKEN MATCH!" };
      }
    }
  }

  // 5. Acronym Matcher (Bidirectional - Hardened)
  const shorter = ni.length < nc.length ? ni : nc;
  const longer = ni.length < nc.length ? input : candidate;
  // Only trigger for 3+ characters to avoid 2-char collisions like "AA"
  if (shorter.length >= 3 && shorter.length <= 4 && !GENERIC_TOKENS.has(shorter)) {
     const tokensLonger = tokenize(longer).filter(t => !WEAK_TOKENS.has(t) && !GENERIC_TOKENS.has(t));
     // If the longer name has many tokens, an acronym match is riskier
     if (tokensLonger.length === shorter.length && tokensLonger.length <= 4) {
        const acronym = tokensLonger.map(t => t[0]).join("");
        if (acronym === shorter) {
           return { relation: "same_group", confidence: "medium", source: "acronym_match", verdict_log: "ACRONYM MATCH! CROSS-VERIFYING VIA SAME_GROUP CLASSIFICATION!" };
        }
     }
  }

  // 6. High-Confidence Substring Match (prevents Gemini calls for obvious subs)
  // Example: "Apple India" vs "Apple"
  if (ni && nc && (ni.startsWith(nc + " ") || nc.startsWith(ni + " ") || ni.endsWith(" " + nc) || nc.endsWith(" " + ni))) {
     const longerTokens = ni.length > nc.length ? taSet : tbSet;
     const shorterTokens = ni.length > nc.length ? tbSet : taSet;
     // If the longer name only adds generic tokens (like "India", "Group", "Solutions")
     const diffTokens = [...longerTokens].filter(t => !shorterTokens.has(t));
     if (diffTokens.every(t => GENERIC_TOKENS.has(t) || WEAK_TOKENS.has(t))) {
        return { relation: "same_company", confidence: "high", source: "substring_t1", verdict_log: "OBVIOUS SUBSIDIARY! SUBSTRING MATCH ON COLD START!" };
     }
  }

  return null;
}

function detectIndustryConflict(a: string, b: string) {
  const ta = new Set<string>(tokenize(a).filter(t => !GENERIC_TOKENS.has(t)));
  const tb = new Set<string>(tokenize(b).filter(t => !GENERIC_TOKENS.has(t)));
  
  if (ta.size === 0 || tb.size === 0) return false; // Don't conflict if only generic tokens remain
  
  const shared = [...ta].filter(t => tb.has(t) && t.length >= 4);
  if (shared.length > 0) return false;

  for (let i = 0; i < INDUSTRY_CLUSTERS.length; i++) {
    if (!INDUSTRY_CLUSTERS[i].some(kw => ta.has(kw))) continue;
    for (let j = 0; j < INDUSTRY_CLUSTERS.length; j++) {
      if (i === j) continue;
      if (INDUSTRY_CLUSTERS[j].some(kw => tb.has(kw))) return true;
    }
  }
  return false;
}

function applyClassificationRules(score: number, overlap: number, isSubset: boolean) {
  if (!isSubset && overlap < 0.45) return { relation: "different", confidence: "high", source: "hard_rejection_overlap", verdict_log: "WEAK MANA! HARSH REJECTION BY THE ENGINE!" };
  if (score >= 0.95 && (overlap >= 0.85 || isSubset)) return { relation: "same_company", confidence: "high", source: "score_rule_t1", verdict_log: "OVER 9000! ULTRA HIGH SCORE AUTOMATCH!" };
  if (score < 0.65 || (!isSubset && overlap < 0.55)) return { relation: "different", confidence: "high", source: "low_score_rule", verdict_log: "MISSED ATTACK! SCORE IS TOO LOW TO QUALIFY!" };
  // Return null to drop into the AI Arena for everything else
  return null;
}

const AI_FALLBACK = { relation: "different", confidence: "low", source: "ai_fallback", verdict_log: "ERROR! AI ABORTED THE MATCH! SAFETY DEFAULT!" };

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 8, onRetry?: (delay: number, attempt: number, status: number) => void) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        // Enterprise backoff with Jitter: prevents multiple simultaneous retries from clashing
        const jitter = Math.random() * 1000;
        const delay = (Math.pow(2, attempt) * 2000) + jitter;
        
        if (onRetry) onRetry(delay, attempt + 1, res.status);
        console.warn(`[ENTERPRISE ENGINE] HTTP ${res.status} detected. Backing off ${delay / 1000}s (Attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const jitter = Math.random() * 1000;
      const delay = (Math.pow(2, attempt) * 2000) + jitter;
      if (onRetry) onRetry(delay, attempt + 1, 0);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("PROBABILITY OF SUCCESS DEPLETED: MAX RETRIES EXCEEDED");
}

interface AuthPayload {
  type: string;
  value: string;
}

class Semaphore {
  active = 0;
  queue: Array<() => void> = [];
  constructor(public limit: number) {}
  async acquire() {
    if (this.active < this.limit) { this.active++; return; }
    await new Promise<void>(resolve => this.queue.push(resolve));
    this.active++;
  }
  release() {
    this.active = Math.max(0, this.active - 1);
    if (this.queue.length > 0) this.queue.shift()!();
  }
}

// Dynamic Concurrency: If using a custom key or admin mode with a custom key, we can increase throughput.
// For the shared app key, we stay at 1 to avoid instant 429 cascades.
let aiSemaphore = new Semaphore(1);

async function callAI(
  input: string, 
  candidate: string, 
  score: number, 
  overlap: number, 
  authPayload: AuthPayload | null,
  otherCandidates: string[] = [],
  onRateLimit?: (msg: string) => void
) {
  // Initialize semaphore based on auth clearing level once
  if (authPayload?.type === "key" || (authPayload?.type === "password" && authPayload?.value === "@$#Pja123")) {
     if (aiSemaphore.active === 0 && aiSemaphore.limit === 1) {
        aiSemaphore = new Semaphore(3);
     }
  }

  const ni = normalizeName(input);
  const nc = normalizeName(candidate);
  const key = `${ni}||${nc}`;
  if (caches.aiCache.has(key)) return caches.aiCache.get(key);

  const store = (v: any) => { 
    caches.aiCache.set(key, v); 
    persistCache();
    return v; 
  };

  const tryServer = async () => {
    return await fetchWithRetry("/api/verify-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, candidate, ni, nc, score, overlap, authPayload, otherCandidates })
    }, 8, (delay, attempt) => {
      if (onRateLimit) onRateLimit(`RATE LIMIT DETECTED! BACKING OFF ${Math.round(delay/1000)}s... (TRY ${attempt}/8)`);
    });
  };

  try {
    await aiSemaphore.acquire();
    try {
      let aiRes: any;
      let usedClient = false;

      // "FALL BACK TO APP API" logic: 
      // If we have a custom key, we try to call Gemini directly from the client (worker) first.
      // This bypasses server infrastructure limits and uses the user's specific quota.
      if (authPayload?.type === "key" && authPayload.value) {
        try {
          const cleanKey = authPayload.value.replace(/[^a-zA-Z0-9_\-]/g, "").trim();
          const genAI = new GoogleGenAI({ apiKey: cleanKey });
          
          aiRes = await tryServer();
          if (!aiRes.ok && aiRes.status === 429) {
             usedClient = true;
             console.log("[ENGINE] SERVER QUOTA EXHAUSTED. FALLING BACK TO CLIENT-SIDE GEMINI API...");
             const result = await genAI.models.generateContent({
                model: "gemini-flash-latest",
                contents: `Fighter A: "${input}"\nFighter B: "${candidate}"\nNormalized A: "${ni}"\nNormalized B: "${nc}"\nDetermine if identical entity, same group, or different. \nResponse format: JSON { relation: 'same_company'|'same_group'|'different', confidence: 'high'|'medium'|'low', verdict_log: string }`,
                config: {
                  responseMimeType: "application/json"
                }
             });
             const responseText = result.text;
             const parsed = JSON.parse(responseText);
             return store({ ...parsed, source: "gemini_client" });
          }
        } catch (clientErr) {
          console.warn("[ENGINE] Client-side AI Fallback failed:", clientErr);
          // Continue to server logic if client failed
        }
      }

      if (!usedClient) {
        aiRes = await tryServer();
      }

      if (!aiRes.ok) {
        if (aiRes.status === 401) {
           const parsed = await aiRes.json().catch(() => ({}));
           if (parsed?.error === "API_KEY_INVALID") {
              throw new Error("THE API KEY YOU PROVIDED IS INVALID! CHECK FOR TYPOS OR PERMISSIONS.");
           }
           throw new Error("UNAUTHORIZED! WRONG API KEY OR PASSWORD!");
        }
        console.warn(`[AI] HTTP ${aiRes.status}`);
        return store(AI_FALLBACK);
      }

      const parsed = await aiRes.json();
      if (!parsed || !parsed.relation) return store(AI_FALLBACK);
      return store({ relation: parsed.relation, confidence: parsed.confidence, source: "gemini", verdict_log: parsed.verdict_log || "THE AI HAS SPOKEN!" });
    } finally {
      aiSemaphore.release();
    }
  } catch (err: any) {
    if (err.message.includes("API KEY YOU PROVIDED IS INVALID") || err.message.includes("UNAUTHORIZED!")) {
       throw err; 
    }
    return store(AI_FALLBACK);
  }
}

function validateAIResult(aiResult: any, score: number, overlap: number, isSubset: boolean) {
  const { relation, confidence, source, verdict_log } = aiResult;
  if (confidence === "low") return { relation: "different", confidence: "high", source: "ai_downgraded_low_conf", verdict_log: "DOWNGRADED! AI LACKED RESOLVE (LOW CONFIDENCE)!" };
  if (relation === "same_company" && score < 0.70) return { relation: "same_group", confidence: "high", source: "ai_downgraded_score", verdict_log: "NERFED! MOVED TO SAME GROUP DUE TO LOW BASE SCORE!" };
  if (relation === "same_group" && score < 0.50) return { relation: "different", confidence: "high", source: "ai_downgraded_group_score", verdict_log: "REJECTED! SAME GROUP CLAIM OVERRULED BY ABYSMAL SCORE!" };
  if (relation !== "different" && !isSubset && overlap < 0.35) return { relation: "different", confidence: "high", source: "ai_overridden_overlap", verdict_log: "VETOED! AI CLAIM WAS BUSTED BY LOW TOKEN OVERLAP!" };
  if (relation === "same_company" && !isSubset && overlap < 0.40) return { relation: "same_group", confidence: "high", source: "ai_downgraded_overlap", verdict_log: "NERFED! REDUCED TO SAME GROUP (WEAK TOKEN OVERLAP)!" };
  return { relation, confidence, source, verdict_log };
}

export async function runEngine(
  inputList: string[],
  suppList: string[],
  authPayload: { type: string, value: string } | null,
  onProgress: (p: number, currentPhase: string, latestMatchStr?: string, tokenConsumed?: boolean) => void
) {
  onProgress(0, "INITIATING SCAN...");
  caches.normCache.clear();
  caches.matchResultCache.clear();

  await delayFrame();
  
  onProgress(2, "DEDUPLICATING INPUTS...");
  // Dedup inputs to save API limit
  const seenNorm = new Set();
  const dedupedInp: string[] = [];
  for (const name of inputList) {
    const nk = normalizeName(name);
    if (!seenNorm.has(nk)) {
      seenNorm.add(nk);
      dedupedInp.push(name);
    }
  }
  const processInp = dedupedInp;
  const total = processInp.length;
  
  onProgress(3, "PREPARING BOSS LIST (75K CAP)...");
  await delayFrame();

  const suppIndex = new Map<string, Set<string>>();
  const exactNormSupp = new Map<string, string>();

  // Chunk index building to prevent long-tasks in worker
  for (let i = 0; i < suppList.length; i += 5000) {
    const chunk = suppList.slice(i, i + 5000);
    for (const c of chunk) {
      const ni = normalizeName(c);
      if (!exactNormSupp.has(ni)) exactNormSupp.set(ni, c);

      const toks = tokenize(c).filter(t => !WEAK_TOKENS.has(t));
      const strongToks = toks.filter(t => !GENERIC_TOKENS.has(t));
      const indexToks = strongToks.length > 0 ? strongToks : toks;

      for (const t of indexToks) {
        if (!suppIndex.has(t)) suppIndex.set(t, new Set());
        suppIndex.get(t)!.add(c);
      }
    }
    const idxPct = 3 + Math.floor((i / suppList.length) * 17); // Use 17% of progress for indexing (up to 20%)
    onProgress(idxPct, `ANALYZING BOSS LIST (${i}/${suppList.length})...`);
    await delayFrame();
  }

  const quota = {
    sent: 0,
    cap: Math.ceil(total * MAX_MATCHES * AI_BUDGET_PCT),
  };

  const allResults = [];
  let processedCount = 0;

  for (let i = 0; i < processInp.length; i += CHUNK_SIZE) {
    const chunk = processInp.slice(i, i + CHUNK_SIZE);
    
    const chunkPromises = chunk.map(async (input) => {
      const inputTokens = tokenize(input).filter(t => !WEAK_TOKENS.has(t));
      let candidates: string[] = [];

      if (inputTokens.length > 0) {
        const candidateSet = new Set<string>();
        const strongToks = inputTokens.filter(t => !GENERIC_TOKENS.has(t));
        const searchToks = strongToks.length > 0 ? strongToks : inputTokens;

        for (const tok of searchToks) {
          const hits = suppIndex.get(tok);
          if (hits) for (const c of hits) candidateSet.add(c);
        }
        
        const ni = normalizeName(input);
        if (exactNormSupp.has(ni)) {
          candidateSet.add(exactNormSupp.get(ni)!);
        }
        
        candidates = [...candidateSet];
      }

      const candidateList = candidates.length > MAX_CANDIDATES
        ? candidates.slice(0, MAX_CANDIDATES) : candidates;

      const scored = [];
      for (const candidate of candidateList) {
        const score = computeScore(input, candidate);
        if (score >= MIN_SCORE) scored.push({ candidate, score });
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, MAX_MATCHES);

      const matches = [];
      for (const { candidate, score } of top) {
        const ta = new Set<string>(tokenize(input));
        const tb = new Set<string>(tokenize(candidate));
        
        // Block empty matches early before overlap metrics blow up.
        if (ta.size === 0 || tb.size === 0) {
           matches.push({ candidate, score: 0, overlap: 0, relation: "different", confidence: "high", source: "noise_rejection", verdict_log: "REJECTED! NOISE WORDS DETECTED!" });
           continue;
        }

        const overlap = tokenOverlap(input, candidate);

        const inter = [...ta].filter(t => tb.has(t)).length;
        let isSubset = false;
        if (inter > 0 && inter === Math.min(ta.size, tb.size)) isSubset = true;
        
        const ni = normalizeName(input), nc = normalizeName(candidate);
        // Optimized subset detection: check for word boundaries to avoid Apple in Snapple
        const regexI = new RegExp(`\\b${ni}\\b`, 'i');
        const regexC = new RegExp(`\\b${nc}\\b`, 'i');
        if (nc.length > 4 && regexI.test(nc)) isSubset = true;
        if (ni.length > 4 && regexC.test(ni)) isSubset = true;

          const det = applyDeterministicRules(input, candidate);
          if (det) {
            if (det.relation !== "different") {
               const icon = det.relation === "same_company" ? "★" : "👥";
               onProgress(-1, `${icon} AUTO-MATCH: ${input} → ${candidate}`);
            }
            matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...det });
            continue;
          }

        if (detectIndustryConflict(input, candidate)) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), relation: "different", confidence: "high", source: "industry_conflict", verdict_log: "COMBO BREAKER! ASSASSINATED BY INDUSTRY CONFLICT!" });
          continue;
        }

        const rule = applyClassificationRules(score, overlap, isSubset);
        if (rule) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...rule });
          continue;
        }

        if (score < AI_MIN_SCORE || (!isSubset && overlap < 0.55)) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), relation: "different", confidence: "high", source: "ai_eligibility_rejected", verdict_log: "PUNY STATS! REJECTED BEFORE ENTERING THE AI ARENA!" });
          continue;
        }

        let allowed = true;
        const pairKey = `${normalizeName(input)}||${normalizeName(candidate)}`;
        if (!caches.aiCache.has(pairKey)) {
          if (quota.sent >= quota.cap) allowed = false;
          else quota.sent += 1;
        }

        if (allowed) {
          const isCached = caches.aiCache.has(pairKey);
          if (!isCached) onProgress(-1, "", undefined, true); // Dispatch token consumed
          
          // Collect other candidates to give the AI context
          const otherNames = top
            .filter(c => c.candidate !== candidate && c.score > 0.4)
            .map(c => c.candidate)
            .slice(0, 3);

          const raw = await callAI(input, candidate, score, overlap, authPayload, otherNames, (msg) => {
             onProgress(-1, msg); // Use -1 to not affect percent but update text
          });
          
          // ADAPTIVE RPM THROTTLE (Free Tier target: 15 RPM)
          // If Semaphore is 1, wait 4s (15 calls/min)
          // If Semaphore is 3 (BYOK), wait 12s per thread (3 * 5 calls/min = 15 RPM)
          const multiplier = aiSemaphore.limit > 1 ? aiSemaphore.limit : 1;
          const throttleDelay = 4000 * multiplier;
          
          await new Promise(resolve => setTimeout(resolve, throttleDelay)); 
          const validated = validateAIResult(raw, score, overlap, isSubset);
          
          if (validated.relation !== "different") {
             const icon = validated.relation === "same_company" ? "★" : "👥";
             onProgress(-1, `${icon} MATCH: ${input} → ${candidate} (${validated.relation.toUpperCase()})`);
          }
          
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...validated });
        } else {
          const heuristic = (score >= 0.90 && overlap >= 0.8) ? "same_company" : (score >= 0.80 && overlap >= 0.6) ? "same_group" : "different";
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), relation: heuristic, confidence: "low", source: "quota_heuristic", verdict_log: "QUOTA EXHAUSTED! BLIND CONSERVATIVE HEURISTIC APPLIED!" });
        }
      }

      processedCount++;
      const currentPct = 20 + Math.floor((processedCount / total) * 80);
      onProgress(currentPct, `MATCHING... (${processedCount}/${total})`);
      return { input, matches: matches.sort((a,b)=>b.score - a.score) };
    });

    const chunkResults = await Promise.all(chunkPromises);
    allResults.push(...chunkResults);
    await delayFrame();
  }

  // Final stats
  onProgress(100, "SYSTEMS CLEAR! ALL KOMBATANTS RESOLVED!");
  return allResults;
}

function delayFrame() {
  return new Promise(resolve => setTimeout(resolve, 150));
}

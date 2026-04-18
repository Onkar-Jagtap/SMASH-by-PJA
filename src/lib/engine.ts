// ==============================================================================
// CMIP MATCHING ENGINE
// ==============================================================================

const CHUNK_SIZE = 100; // UI chunking
const MIN_SCORE = 0.35;
const MAX_MATCHES = 5;
const AI_BUDGET_PCT = 1.0;
const MAX_CANDIDATES = 2000;
const AI_MIN_SCORE = 0.65;
const AI_MIN_OVERLAP = 0.50;

const LEGAL_SUFFIX_RE = /\b(ltd|limited|pvt|private|inc|llc|corp|corporation|plc|co|company)\b\.?/gi;

const WEAK_TOKENS = new Set([
  "and", "the", "of", "in", "at", "for", "to", "a", "an", "is", "by", "or", "on", "as",
  "de", "la", "le", "van", "von", "el", "al", "du", "das", "der", "die", "da", "do", "&",
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
  ["insurance", "reinsurance", "underwriter"],
  ["media", "broadcast", "publishing", "entertainment"],
  ["telecom", "telecommunications", "wireless", "mobile", "broadband"],
  ["software", "saas", "cloud", "platform", "application"],
  ["logistics", "shipping", "freight", "courier", "supply"],
  ["construction", "infrastructure", "engineering", "builder"],
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
  "porsche": "volkswagen_group",
};

// Caches
export const caches = { normCache: new Map(), matchResultCache: new Map(), aiCache: new Map() };

const GENERIC_TOKENS = new Set([
  "technologies", "tech", "technology", "info", "information", "solutions", "group", "holdings", "systems",
  "services", "enterprises", "international", "industries", "consulting",
  "management", "partners", "ventures", "capital", "network", "networks",
  "media", "financial", "digital", "global", "corporation", "communications",
  "software", "logistics"
]);

function normalizeName(raw: string) {
  if (!raw || typeof raw !== "string") return "";
  const key = raw;
  if (caches.normCache.has(key)) return caches.normCache.get(key);

  let n = raw.toLowerCase().trim();
  n = n.replace(/^\uFEFF/, "");
  n = n.replace(/[&]/g, " and ");
  n = n.replace(/[^\w\s]/g, " ");
  n = n.replace(LEGAL_SUFFIX_RE, " ");
  n = n.replace(/\s+/g, " ").trim();
  n = n.split(" ").map(t => ABBREV_MAP[t] || (t === "it" ? "information technology" : t)).join(" ");
  n = n.replace(/\s+/g, " ").trim();
  caches.normCache.set(key, n);
  return n;
}

function tokenize(name: string) {
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
  return null;
}

function detectIndustryConflict(a: string, b: string) {
  const ta = new Set<string>(tokenize(a)), tb = new Set<string>(tokenize(b));
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

function applyClassificationRules(score: number, overlap: number) {
  if (overlap < 0.4) return { relation: "different", confidence: "high", source: "hard_rejection_overlap", verdict_log: "WEAK MANA! HARSH REJECTION BY THE ENGINE!" };
  if (score >= 0.95 && overlap >= 0.85) return { relation: "same_company", confidence: "high", source: "score_rule_t1", verdict_log: "OVER 9000! ULTRA HIGH SCORE AUTOMATCH!" };
  if (score < 0.65 || overlap < 0.5) return { relation: "different", confidence: "high", source: "low_score_rule", verdict_log: "MISSED ATTACK! SCORE IS TOO LOW TO QUALIFY!" };
  // Return null to drop into the AI Arena for everything between 0.65 and 0.95
  return null;
}

const AI_FALLBACK = { relation: "different", confidence: "low", source: "ai_fallback", verdict_log: "ERROR! AI ABORTED THE MATCH! SAFETY DEFAULT!" };

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 6) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        // Enterprise backoff: 2s, 4s, 8s, 16s, 32s (very safe for Rate Limits)
        const delay = Math.pow(2, attempt) * 2000;
        console.warn(`[API] Rate limit or server error (HTTP ${res.status}). Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
    }
  }
  throw new Error("Max retries exceeded");
}

function makeSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire() {
      if (active < limit) { active++; return; }
      await new Promise<void>(resolve => queue.push(resolve));
      active++;
    },
    release() {
      active = Math.max(0, active - 1);
      if (queue.length > 0) queue.shift()!();
    }
  };
}

// Enterprise Concurrency (Low and steady to never trigger 429 API blocks)
const aiSemaphore = makeSemaphore(3);

async function callAI(input: string, candidate: string, score: number, overlap: number, authPayload: { type: string, value: string } | null) {
  const ni = normalizeName(input);
  const nc = normalizeName(candidate);
  const key = `${ni}||${nc}`;
  if (caches.aiCache.has(key)) return caches.aiCache.get(key);

  const store = (v: any) => { caches.aiCache.set(key, v); return v; };

  try {
    await aiSemaphore.acquire();
    try {
      const aiRes = await fetchWithRetry("/api/verify-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, candidate, ni, nc, score, overlap })
      });

      if (!aiRes.ok) {
        if (aiRes.status === 401) {
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
    console.warn("[AI] Exception:", err.message);
    return store(AI_FALLBACK);
  }
}

function validateAIResult(aiResult: any, score: number, overlap: number) {
  const { relation, confidence, source, verdict_log } = aiResult;
  if (confidence !== "high") return { relation: "different", confidence: "high", source: "ai_downgraded_low_conf", verdict_log: "DOWNGRADED! AI LACKED RESOLVE (LOW CONFIDENCE)!" };
  if (relation === "same_company" && score < 0.85) return { relation: "same_group", confidence: "high", source: "ai_downgraded_score", verdict_log: "NERFED! MOVED TO SAME GROUP DUE TO LOW BASE SCORE!" };
  if (relation === "same_group" && score < 0.65) return { relation: "different", confidence: "high", source: "ai_downgraded_group_score", verdict_log: "REJECTED! SAME GROUP CLAIM OVERRULED BY ABYSMAL SCORE!" };
  if (relation !== "different" && overlap < 0.4) return { relation: "different", confidence: "high", source: "ai_overridden_overlap", verdict_log: "VETOED! AI CLAIM WAS BUSTED BY LOW TOKEN OVERLAP!" };
  if (relation === "same_company" && overlap < 0.5) return { relation: "same_group", confidence: "high", source: "ai_downgraded_overlap", verdict_log: "NERFED! REDUCED TO SAME GROUP (WEAK TOKEN OVERLAP)!" };
  return { relation, confidence, source, verdict_log };
}

export async function runEngine(
  inputList: string[],
  suppList: string[],
  authPayload: { type: string, value: string } | null,
  onProgress: (p: number, currentPhase: string, latestMatchStr?: string) => void
) {
  caches.normCache.clear();
  caches.matchResultCache.clear();

  delayFrame();
  
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
  
  onProgress(5, "Building Suppression Index...");
  await delayFrame();

  const suppIndex = new Map<string, Set<string>>();
  const exactNormSupp = new Map<string, string>();

  for (const c of suppList) {
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

  const quota = {
    sent: 0,
    cap: Math.ceil(total * MAX_MATCHES * AI_BUDGET_PCT),
  };

  const allResults = [];
  let processed = 0;

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
        const overlap = tokenOverlap(input, candidate);

        const det = applyDeterministicRules(input, candidate);
        if (det) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...det });
          continue;
        }

        if (detectIndustryConflict(input, candidate)) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), relation: "different", confidence: "high", source: "industry_conflict", verdict_log: "COMBO BREAKER! ASSASSINATED BY INDUSTRY CONFLICT!" });
          continue;
        }

        const rule = applyClassificationRules(score, overlap);
        if (rule) {
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...rule });
          continue;
        }

        if (score < AI_MIN_SCORE || overlap < AI_MIN_OVERLAP) {
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
          const raw = await callAI(input, candidate, score, overlap, authPayload);
          const validated = validateAIResult(raw, score, overlap);
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), ...validated });
        } else {
          const heuristic = (score >= 0.90 && overlap >= 0.8) ? "same_company" : (score >= 0.80 && overlap >= 0.6) ? "same_group" : "different";
          matches.push({ candidate, score: +score.toFixed(4), overlap: +overlap.toFixed(3), relation: heuristic, confidence: "low", source: "quota_heuristic", verdict_log: "QUOTA EXHAUSTED! BLIND CONSERVATIVE HEURISTIC APPLIED!" });
        }
      }

      return { input, matches: matches.sort((a,b)=>b.score - a.score) };
    });

    const chunkResults = await Promise.all(chunkPromises);
    allResults.push(...chunkResults);
    
    processed += chunk.length;
    onProgress(10 + Math.floor((processed / total) * 90), `Processing ${processed} / ${total} companies...`);
    await delayFrame();
  }

  // Final stats
  onProgress(100, "Processing complete!");
  return allResults;
}

function delayFrame() {
  return new Promise(resolve => setTimeout(resolve, 50));
}

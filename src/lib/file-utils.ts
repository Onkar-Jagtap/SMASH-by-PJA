import * as XLSX from "xlsx";

/**
 * Parses files safely handles Excel, CSV, TSV, TXT formats
 */
export async function parseFile(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (["xlsx", "xls", "xlsb", "xlsm", "ods"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
          const names: string[] = [];
          rows.forEach((row, ri) => {
            const v = String(row[0] ?? "").trim();
            if (!v) return;
            if (ri === 0 && /^(company|name|account|organization|client|vendor|customer|firm|entity)/i.test(v)) return;
            names.push(v);
          });
          names.length ? resolve(names) : reject(new Error("No company names found in spreadsheet"));
        } catch (e: any) {
          reject(new Error("Spreadsheet parse error: " + e.message));
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const names = parseTextFile(e.target?.result as string || "");
        names.length ? resolve(names) : reject(new Error("No valid company names found"));
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsText(file, "UTF-8");
    }
  });
}

function parseTextFile(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const names: string[] = [];
  const sample = lines.slice(0, 5).join("\n");
  const delim = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : sample.includes(",") ? "," : null;

  lines.forEach((line, li) => {
    if (!line.trim()) return;
    const first = delim ? parseCSVLine(line)[0]?.replace(/^["']|["']$/g, "").trim() : line.trim();
    if (!first) return;
    if (li === 0 && /^(company|name|account|organization|client|vendor|customer|firm|entity)/i.test(first)) return;
    names.push(first);
  });
  return names;
}

function parseCSVLine(line: string): string[] {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ && line[i + 1] === '"' ? ((cur += '"'), i++) : (inQ = !inQ);
    } else if ((c === "," || c === ";" || c === "\t") && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function exportResults(results: any[], format: "csv" | "xlsx") {
  const headers = ["Input Hit List", "Match Discovered", "Verdict Relation", "AI Confidence", "Machine Fuzz Score", "Token Mana (Overlap)", "Verdict Source", "Announcer Combat Log (Reason)"];
  
  if (format === "csv") {
    const chunks = ["\uFEFF" + headers.map(h => `"${h}"`).join(",") + "\r\n"];
    for (const row of results) {
      if (!row.matches || !row.matches.length) {
        chunks.push(`"${row.input}","No Opponent Found","","","","","","\"\r\n`);
      } else {
        for (const m of row.matches) {
          const cells = [
            row.input, m.candidate,
            m.relation, m.confidence,
            (m.score * 100).toFixed(1) + "%",
            (m.overlap * 100).toFixed(0) + "%",
            m.source,
            m.verdict_log || ""
          ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
          chunks.push(cells.join(",") + "\r\n");
        }
      }
    }
    const blob = new Blob(chunks, { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cmip_results.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } else {
    const BATCH = 5000;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    let rowOffset = 1;
    for (let b = 0; b < results.length; b += BATCH) {
      const batch = results.slice(b, b + BATCH);
      const aoa: any[][] = [];
      for (const row of batch) {
        if (!row.matches || !row.matches.length) {
          aoa.push([row.input, "No Opponent Found", "", "", "", "", "", ""]);
        } else {
          for (const m of row.matches) {
            aoa.push([
              row.input, m.candidate,
              m.relation, m.confidence,
              (m.score * 100).toFixed(1) + "%",
              (m.overlap * 100).toFixed(0) + "%",
              m.source ?? "",
              m.verdict_log ?? ""
            ]);
          }
        }
      }
      XLSX.utils.sheet_add_aoa(ws, aoa, { origin: rowOffset });
      rowOffset += aoa.length;
    }
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "cmip_results.xlsx");
  }
}

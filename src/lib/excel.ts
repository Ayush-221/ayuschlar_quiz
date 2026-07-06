import * as XLSX from 'xlsx';

export interface Question {
  question: string;
  options: string[];
  correct_idx: number;
  explanation: string;
}

export const OPTION_SHORTCUTS: Record<string, string> = {
  "both a and r are true and r is the correct explanation of a":
    "Both true, R explains A / दोनों सही, R कारण है",
  "both a and r are true but r is not the correct explanation of a":
    "Both true, R does NOT explain A / दोनों सही, R कारण नहीं",
  "a is true but r is false":
    "A true, R false / A सही, R गलत",
  "a is false but r is true":
    "A false, R true / A गलत, R सही",
};

export function smartShorten(text: string | null | undefined, maxLen = 95): string {
  if (!text) return "—";
  const t = text.trim();
  for (const [pattern, short] of Object.entries(OPTION_SHORTCUTS)) {
    if (t.toLowerCase().includes(pattern)) {
      return short.substring(0, maxLen);
    }
  }
  if (t.includes(" / ") && t.length > maxLen) {
    const parts = t.split(" / ", 2);
    const half = Math.floor((maxLen - 3) / 2);
    return `${parts[0].substring(0, half)} / ${parts[1].substring(0, half)}`;
  }
  return t.length > maxLen ? t.substring(0, maxLen - 1) + "…" : t;
}

export function parseQuestionsFromBuffer(buffer: Buffer): Question[] {
  // Read workbook from buffer
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to sheet array of arrays
  const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });
  
  const questions: Question[] = [];
  const answerMap: Record<string, number> = { a: 0, b: 1, c: 2, d: 3 };

  for (const row of rows) {
    if (!row || row.length < 2 || !row[1]) continue; // Skip if no question text
    
    // Column G (index 6) is correct answer (a, b, c, d)
    const correctRaw = row[6] ? String(row[6]).trim().toLowerCase().replace(/\n/g, '') : 'a';
    const correctIdx = answerMap[correctRaw[0] || 'a'] ?? 0;
    
    // Columns C, D, E, F (indexes 2, 3, 4, 5) are options
    const opts = [row[2], row[3], row[4], row[5]].map(o => 
      o !== null && o !== undefined ? String(o).trim() : ''
    );
    
    // Column H (index 7) is explanation
    const explanation = row[7] !== null && row[7] !== undefined ? String(row[7]).trim() : '';
    
    const q: Question = {
      question: String(row[1]).trim(),
      options: opts.map(o => smartShorten(o)),
      correct_idx: correctIdx,
      explanation: explanation,
    };
    
    // Require valid question text and at least 4 options (non-empty, non-placeholder)
    if (q.question && q.options.every(o => o && o !== "—")) {
      questions.push(q);
    }
  }
  
  return questions;
}

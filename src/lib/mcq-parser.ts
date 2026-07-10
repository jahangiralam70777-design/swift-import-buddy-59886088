/**
 * Strict MCQ text parser.
 *
 *   Q1: <question>
 *   A. <option A>
 *   B. <option B>
 *   C. <option C>
 *   D. <option D>
 *   Answer: D. <option D text>   (or just "D")
 *   Explanation: <optional>
 *
 * MCQs are split on `Q<number>:` anchors. Order is preserved exactly.
 */

export type ParseIssue =
  | "missing_question"
  | "missing_option_a"
  | "missing_option_b"
  | "missing_option_c"
  | "missing_option_d"
  | "missing_answer"
  | "invalid_answer"
  | "duplicate_question"
  | "duplicate_in_database"
  | "broken_structure";

export type ParsedMcq = {
  serial: number;
  detectedSerial?: number;
  question: string;
  options: { key: string; text: string }[];
  answer: string;
  answerText?: string;
  explanation: string;
  issues: ParseIssue[];
  isDuplicate: boolean;
  duplicateOf?: number;
  valid: boolean;
  raw: string;
};

export type ParseSummary = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  ready: number;
  skipped: number;
};

export const ISSUE_LABEL: Record<ParseIssue, string> = {
  missing_question: "Missing Question",
  missing_option_a: "Missing Option A",
  missing_option_b: "Missing Option B",
  missing_option_c: "Missing Option C",
  missing_option_d: "Missing Option D",
  missing_answer: "Missing Answer",
  invalid_answer: "Invalid Answer",
  duplicate_question: "Duplicate Question",
  duplicate_in_database: "Duplicate in Database",
  broken_structure: "Broken Format",
};

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .trim();
}

function normaliseForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Split on Q<n>: anchors                                              */
/* ------------------------------------------------------------------ */

type Block = { detectedSerial: number; body: string; raw: string };

function splitBlocks(text: string): Block[] {
  const re = /(^|\n)\s*Q\s*(\d{1,5})\s*[:.\-)]\s*/gi;
  const anchors: { serial: number; start: number; headEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + (m[1] ? m[1].length : 0);
    anchors.push({
      serial: Number(m[2]),
      start,
      headEnd: m.index + m[0].length,
    });
  }
  if (anchors.length === 0) return [];
  const blocks: Block[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const end = i + 1 < anchors.length ? anchors[i + 1].start : text.length;
    blocks.push({
      detectedSerial: a.serial,
      body: text.slice(a.headEnd, end).trim(),
      raw: text.slice(a.start, end).trim(),
    });
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Per-block parser                                                    */
/* ------------------------------------------------------------------ */

const OPT_RE = /^\s*([A-D])\s*[.):-]\s*(.*)$/;
const ANS_RE = /^\s*(?:Answer|Ans|Correct\s+Answer|Key)\s*[:-]\s*(.*)$/i;
const EXP_RE = /^\s*(?:Explanation|Explain|Solution|Reason)\s*[:-]\s*(.*)$/i;

function parseBlock(block: Block, serial: number): ParsedMcq {
  const issues: ParseIssue[] = [];
  const lines = block.body.split("\n");

  const questionLines: string[] = [];
  const optionsMap = new Map<string, string>();
  let answerRaw = "";
  const explanationLines: string[] = [];

  type Mode = "question" | "option" | "answer" | "explanation";
  let mode: Mode = "question";
  let currentOptKey = "";

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() && mode !== "explanation") continue;

    const expMatch = EXP_RE.exec(line);
    if (expMatch) {
      mode = "explanation";
      if (expMatch[1]) explanationLines.push(expMatch[1]);
      continue;
    }

    const ansMatch = ANS_RE.exec(line);
    if (ansMatch) {
      mode = "answer";
      answerRaw = ansMatch[1].trim();
      continue;
    }

    const optMatch = OPT_RE.exec(line);
    if (optMatch && (mode === "question" || mode === "option")) {
      currentOptKey = optMatch[1].toUpperCase();
      const prev = optionsMap.get(currentOptKey) ?? "";
      if (prev) {
        // Duplicate option key — mark broken but keep last
      }
      optionsMap.set(currentOptKey, optMatch[2].trim());
      mode = "option";
      continue;
    }

    if (mode === "question") {
      questionLines.push(line.trim());
    } else if (mode === "option" && currentOptKey) {
      const prev = optionsMap.get(currentOptKey) ?? "";
      optionsMap.set(currentOptKey, (prev + " " + line.trim()).trim());
    } else if (mode === "answer") {
      answerRaw = (answerRaw + " " + line.trim()).trim();
    } else if (mode === "explanation") {
      explanationLines.push(line);
    }
  }

  const question = questionLines.join(" ").replace(/\s+/g, " ").trim();
  const options: { key: string; text: string }[] = [];
  for (const k of ["A", "B", "C", "D"] as const) {
    if (optionsMap.has(k)) {
      options.push({ key: k, text: (optionsMap.get(k) ?? "").trim() });
    }
  }

  // Answer extraction: accept "D", "D.", "D. Option text", or full option text.
  let answer = "";
  let answerText = "";
  if (answerRaw) {
    const letter = /^\(?\s*([A-D])\s*\)?\s*[.):-]?\s*(.*)$/i.exec(answerRaw);
    if (letter) {
      answer = letter[1].toUpperCase();
      answerText = letter[2].trim();
    } else {
      // Try to match by option text
      const ansN = normaliseForCompare(answerRaw);
      const found = options.find((o) => normaliseForCompare(o.text) === ansN);
      if (found) {
        answer = found.key;
        answerText = found.text;
      }
    }
  }

  if (!question) issues.push("missing_question");
  const has = (k: string) => options.some((o) => o.key === k && o.text.length > 0);
  if (!has("A")) issues.push("missing_option_a");
  if (!has("B")) issues.push("missing_option_b");
  if (!has("C")) issues.push("missing_option_c");
  if (!has("D")) issues.push("missing_option_d");
  if (!answerRaw) issues.push("missing_answer");
  else if (!answer || !options.find((o) => o.key === answer)) {
    issues.push("invalid_answer");
  }

  // Fill answerText from options if not captured
  if (answer && !answerText) {
    const f = options.find((o) => o.key === answer);
    if (f) answerText = f.text;
  }

  return {
    serial,
    detectedSerial: block.detectedSerial,
    question,
    options,
    answer,
    answerText,
    explanation: explanationLines.join(" ").replace(/\s+/g, " ").trim(),
    issues,
    isDuplicate: false,
    valid: issues.length === 0,
    raw: block.raw,
  };
}

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

function detectDuplicates(rows: ParsedMcq[]): void {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = normaliseForCompare(r.question);
    if (!key) continue;
    const prior = seen.get(key);
    if (prior !== undefined) {
      r.isDuplicate = true;
      r.duplicateOf = prior;
      if (!r.issues.includes("duplicate_question")) {
        r.issues.push("duplicate_question");
      }
      r.valid = false;
    } else {
      seen.set(key, r.serial);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function parseMcqs(input: string): ParsedMcq[] {
  const text = normalise(input);
  if (!text) return [];
  const blocks = splitBlocks(text);
  if (blocks.length === 0) {
    // No Q<n>: anchors at all — return a single broken row so the user sees why.
    return [
      {
        serial: 1,
        question: "",
        options: [],
        answer: "",
        explanation: "",
        issues: ["broken_structure"],
        isDuplicate: false,
        valid: false,
        raw: text.slice(0, 500),
      },
    ];
  }
  const rows = blocks.map((b, i) => parseBlock(b, i + 1));
  detectDuplicates(rows);
  return rows;
}

export function checkAgainstExisting(rows: ParsedMcq[], existingQuestions: string[]): void {
  const existing = new Set(existingQuestions.map(normaliseForCompare).filter(Boolean));
  if (existing.size === 0) return;
  for (const r of rows) {
    const k = normaliseForCompare(r.question);
    if (k && existing.has(k)) {
      r.isDuplicate = true;
      if (!r.issues.includes("duplicate_in_database")) {
        r.issues.push("duplicate_in_database");
      }
      r.valid = false;
    }
  }
}

export function summarise(rows: ParsedMcq[]): ParseSummary {
  const duplicates = rows.filter((r) => r.isDuplicate).length;
  const valid = rows.filter((r) => r.valid).length;
  const invalid = rows.filter((r) => !r.valid && !r.isDuplicate).length;
  return {
    total: rows.length,
    valid,
    invalid,
    duplicates,
    ready: valid,
    skipped: rows.length - valid,
  };
}

/* ------------------------------------------------------------------ */
/* Sample text                                                         */
/* ------------------------------------------------------------------ */

export const SAMPLE_TEXT = `Q1: What is a major obstacle to increasing tax revenue in Bangladesh?
A. High corporate income tax rates
B. A wide tax base
C. Efficient tax enforcement
D. Narrow tax base with numerous exemptions
Answer: D. Narrow tax base with numerous exemptions
Explanation: A narrow base combined with widespread exemptions is the primary constraint.

Q2: Which planet is known as the Red Planet?
A. Earth
B. Venus
C. Mars
D. Jupiter
Answer: C. Mars

Q3: The powerhouse of the cell is
A. Nucleus
B. Ribosome
C. Mitochondria
D. Chloroplast
Answer: C
Explanation: Mitochondria produce ATP, the energy currency of the cell.`;

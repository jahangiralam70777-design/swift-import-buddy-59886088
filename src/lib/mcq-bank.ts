// MCQ question bank for the student practice module.
//
// The admin MCQ Manager does not currently persist its question bank to
// localStorage (its rows live in in-memory React state). To honour
// "questions come only from admin's Level → Subject → Chapter mapping"
// without editing the admin panel, we generate a deterministic per-chapter
// bank from the same seed pool the admin panel ships with, indexed by the
// chapter id from Academic Manager. When the admin later persists to
// `cla:mcq-bank:v1`, that overrides the derived bank here.

import { chapterMcqTotal } from "./academic-store";

export type McqOption = { key: string; text: string };

export type Mcq = {
  id: string;
  chapterId: string;
  index: number; // 1-based question number within the chapter
  question: string;
  options: McqOption[];
  answer: string; // key of correct option ("A", "B", ...)
  explanation: string;
};

const BANK_KEY = "cla:mcq-bank:v1";

// Seed templates. Kept intentionally small; a chapter with N MCQs gets N
// unique items by rotating templates and stamping the chapter/position into
// each stem so items stay distinguishable and the answer key stays valid.
const TEMPLATES: {
  q: string;
  options: string[];
  answer: string;
  explanation: string;
}[] = [
  {
    q: "Which statement best describes the core idea introduced in this section?",
    options: [
      "It defines the scope and objectives of the topic.",
      "It lists prohibited practices only.",
      "It is unrelated to the chapter subject.",
      "It repeats the introduction verbatim.",
    ],
    answer: "A",
    explanation:
      "The opening of any well-structured section defines scope and objectives before detail.",
  },
  {
    q: "Which of the following is a valid application of the concept discussed?",
    options: [
      "Applying it outside its stated scope.",
      "Using it within the constraints defined by the standard.",
      "Ignoring the assumptions it depends on.",
      "Reversing its cause-and-effect relationship.",
    ],
    answer: "B",
    explanation: "A valid application respects the concept's scope and stated assumptions.",
  },
  {
    q: "Identify the correct order of steps in the standard process.",
    options: [
      "Plan → Perform → Report → Follow up",
      "Report → Plan → Perform → Follow up",
      "Perform → Plan → Follow up → Report",
      "Follow up → Report → Perform → Plan",
    ],
    answer: "A",
    explanation: "Most professional processes follow plan, perform, report, then follow up.",
  },
  {
    q: "Which option correctly states the primary objective?",
    options: [
      "To maximise output regardless of quality.",
      "To provide reasonable assurance that objectives are met.",
      "To eliminate all uncertainty at any cost.",
      "To document activities only after completion.",
    ],
    answer: "B",
    explanation: "The stated goal is reasonable assurance — not absolute certainty.",
  },
  {
    q: "Which of the following is NOT a characteristic of the framework?",
    options: [
      "It is applied consistently across engagements.",
      "It relies on professional judgment.",
      "It replaces documented procedures.",
      "It follows an accepted set of principles.",
    ],
    answer: "C",
    explanation: "The framework supplements — it does not replace — documented procedures.",
  },
  {
    q: "The most reliable evidence in this context is typically:",
    options: [
      "Oral representations by management.",
      "Independently produced external evidence.",
      "Internally generated evidence without review.",
      "Anecdotal observations.",
    ],
    answer: "B",
    explanation: "Externally sourced, independent evidence is generally the most reliable.",
  },
  {
    q: "Which factor most directly influences the extent of testing required?",
    options: [
      "The colour of the working papers.",
      "Assessed risk of material misstatement.",
      "The season of the year.",
      "The size of the office.",
    ],
    answer: "B",
    explanation: "Extent of testing scales with the assessed risk of material misstatement.",
  },
  {
    q: "The concept is best summarised as:",
    options: [
      "A checklist to be completed once.",
      "A one-off historical exercise.",
      "An iterative, evidence-based process.",
      "A confidential internal opinion.",
    ],
    answer: "C",
    explanation: "It is iterative and evidence-based, not a one-off checklist.",
  },
];

// Deterministic hash so the same chapter always gets the same questions.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function readExternalBank(): Record<string, Mcq[]> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BANK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Mcq[]>) : null;
  } catch {
    return null;
  }
}

export function getChapterMcqs(chapterId: string): Mcq[] {
  const external = readExternalBank();
  if (external && Array.isArray(external[chapterId]) && external[chapterId].length > 0) {
    return external[chapterId];
  }
  const total = chapterMcqTotal(chapterId);
  const h = hash(chapterId);
  const items: Mcq[] = [];
  for (let i = 0; i < total; i++) {
    const t = TEMPLATES[(h + i) % TEMPLATES.length];
    // Rotate answer key deterministically so the pattern isn't obvious.
    const shift = (h + i * 31) % 4;
    const rotated = [...t.options.slice(shift), ...t.options.slice(0, shift)];
    const answerIdxOriginal = t.answer.charCodeAt(0) - 65;
    const newAnswerIdx = (answerIdxOriginal - shift + 4) % 4;
    items.push({
      id: `${chapterId}::${i}`,
      chapterId,
      index: i + 1,
      question: `Q${i + 1}. ${t.q}`,
      options: rotated.map((text, j) => ({ key: String.fromCharCode(65 + j), text })),
      answer: String.fromCharCode(65 + newAnswerIdx),
      explanation: t.explanation,
    });
  }
  return items;
}

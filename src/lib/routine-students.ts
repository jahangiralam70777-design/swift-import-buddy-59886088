export type TrackedRoutine = {
  id: string;
  title: string;
  audience: string;
  followers: number;
  completion: number;
  streak: number;
  dailyHours: number;
  status: "active" | "draft" | "paused" | "completed";
  tags: string[];
  accent: string;
};

export type StudentStatus = "on-track" | "behind" | "completed" | "inactive";

export type Student = {
  id: string;
  name: string;
  initials: string;
  level: string;
  routineId: string;
  routineTitle: string;
  subjects: string[];
  chapters: { name: string; done: boolean }[];
  progress: number;
  todayHours: number;
  streak: number;
  missedDays: number;
  lastActivity: string;
  lastActivityAt: Date;
  status: StudentStatus;
  daily: number[];
  weekly: number[];
  monthly: number[];
  mcqsCompleted: number;
  mcqsTotal: number;
  quizCompleted: number;
  quizTotal: number;
  mockCompleted: number;
  mockTotal: number;
  studyHoursTotal: number;
  attendance: { day: string; hours: number; present: boolean }[];
};

function makeRng(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Aarav",
  "Ananya",
  "Arjun",
  "Diya",
  "Ishaan",
  "Kavya",
  "Krish",
  "Meera",
  "Neel",
  "Nisha",
  "Om",
  "Pari",
  "Rohan",
  "Saanvi",
  "Shaurya",
  "Tara",
  "Vihaan",
  "Zara",
  "Aditya",
  "Riya",
  "Kabir",
  "Anika",
  "Dhruv",
  "Ira",
  "Yash",
  "Aisha",
  "Reyansh",
  "Myra",
  "Vivaan",
  "Kiara",
  "Advait",
  "Navya",
];
const LAST_NAMES = [
  "Sharma",
  "Iyer",
  "Menon",
  "Patel",
  "Nair",
  "Rao",
  "Khan",
  "Shah",
  "Singh",
  "Reddy",
  "Ghosh",
  "Bose",
  "Kapoor",
  "Verma",
  "Joshi",
  "Bhat",
];

export function parseLevel(audience: string) {
  return audience.split("·")[0]?.trim() ?? audience;
}

function formatRelative(hoursAgo: number) {
  if (hoursAgo < 1) return "just now";
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  const d = Math.round(hoursAgo / 24);
  return `${d}d ago`;
}

export function synthesizeStudents(routines: TrackedRoutine[]): Student[] {
  const now = Date.now();
  const out: Student[] = [];

  for (const r of routines) {
    // Cap at 2000/routine so 10k+ demos stay smooth without runaway allocations.
    const count = Math.min(r.followers, r.status === "draft" ? 0 : 2000);
    const rng = makeRng(r.id);
    const level = parseLevel(r.audience);

    for (let i = 0; i < count; i++) {
      const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      const name = `${fn} ${ln}`;
      const initials = `${fn[0]}${ln[0]}`;

      const noise = (rng() - 0.5) * 40;
      let progress = Math.round(Math.max(0, Math.min(100, r.completion + noise)));
      if (r.status === "completed") progress = 100;

      const missedDays = Math.max(0, Math.round((100 - progress) / 18 + (rng() - 0.5) * 2));
      const streak =
        progress >= 90
          ? Math.round(18 + rng() * 12)
          : progress >= 60
            ? Math.round(6 + rng() * 10)
            : Math.round(rng() * 4);
      const todayHours = Math.round(rng() * r.dailyHours * 10) / 10;

      let status: StudentStatus;
      if (progress >= 100) status = "completed";
      else if (missedDays >= 5 || todayHours === 0)
        status = missedDays >= 8 ? "inactive" : "behind";
      else if (progress >= r.completion - 5) status = "on-track";
      else status = "behind";

      const hoursAgo = status === "inactive" ? Math.round(24 + rng() * 96) : Math.round(rng() * 12);
      const lastAt = new Date(now - hoursAgo * 3600 * 1000);

      const chapterPool = r.tags.flatMap((t, idx) => [
        `${t} · Fundamentals`,
        `${t} · Applications`,
        `${t} · Practice ${idx + 1}`,
      ]);
      const doneCount = Math.round((progress / 100) * chapterPool.length);
      const chapters = chapterPool.map((name, idx) => ({ name, done: idx < doneCount }));

      const daily = Array.from({ length: 7 }, () => Math.round(rng() * r.dailyHours * 10) / 10);
      const weekly = Array.from({ length: 4 }, (_, w) =>
        Math.round(Math.min(100, progress - 20 + w * 8 + (rng() - 0.5) * 10)),
      );
      const monthly = Array.from({ length: 6 }, (_, m) =>
        Math.round(Math.min(100, Math.max(0, progress - 40 + m * 9 + (rng() - 0.5) * 8))),
      );

      const mcqsTotal = 200 + Math.round(rng() * 300);
      const quizTotal = 20 + Math.round(rng() * 30);
      const mockTotal = 6 + Math.round(rng() * 10);

      const attendance = Array.from({ length: 14 }, (_, d) => {
        const dayDate = new Date(now - (13 - d) * 86400000);
        const present = rng() > (status === "inactive" ? 0.7 : status === "behind" ? 0.35 : 0.12);
        const hrs = present ? Math.round(rng() * r.dailyHours * 10) / 10 : 0;
        return {
          day: dayDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
          hours: hrs,
          present,
        };
      });

      out.push({
        id: `${r.id}_s${i}`,
        name,
        initials,
        level,
        routineId: r.id,
        routineTitle: r.title,
        subjects: r.tags,
        chapters,
        progress,
        todayHours,
        streak,
        missedDays,
        lastActivity: formatRelative(hoursAgo),
        lastActivityAt: lastAt,
        status,
        daily,
        weekly,
        monthly,
        mcqsCompleted: Math.round((progress / 100) * mcqsTotal),
        mcqsTotal,
        quizCompleted: Math.round((progress / 100) * quizTotal),
        quizTotal,
        mockCompleted: Math.round((progress / 100) * mockTotal),
        mockTotal,
        studyHoursTotal: Math.round(progress * r.dailyHours * 0.6),
        attendance,
      });
    }
  }

  return out;
}

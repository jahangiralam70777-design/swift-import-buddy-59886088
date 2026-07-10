import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "motion/react";
import {
  Users,
  ListChecks,
  BookOpen as BookOpenIcon,
  Landmark,
  FileText,
  Trophy,
  Sparkles,
  Brain,
  BookOpen,
  Bookmark,
  ShieldCheck,
  Zap,
  BarChart3,
  Target,
  Calculator,
  Check,
  X,
  ArrowRight,
  Activity,
  Flame,
  Award,
  Clock,
} from "lucide-react";

/* ---------- Shared reveal ---------- */
function Reveal({
  children,
  className = "",
  delay = 0,
  y = 30,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  gradient,
  desc,
}: {
  eyebrow: { icon: React.ReactNode; label: string };
  title: string;
  gradient: string;
  desc?: string;
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-2xl text-center">
        <div className="glass mb-5 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium">
          {eyebrow.icon} {eyebrow.label}
        </div>
        <h2
          className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
          style={{ letterSpacing: "-0.035em", lineHeight: 1.05 }}
        >
          {title} <span className="text-gradient">{gradient}</span>
        </h2>
        {desc && <p className="mt-5 text-base text-muted-foreground sm:text-lg">{desc}</p>}
      </div>
    </Reveal>
  );
}

/* =========================================================
   1. ANIMATED STATISTICS
========================================================= */
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v: number) => {
    if (value >= 1000) {
      const n = v / 1000;
      return n >= 100 ? `${Math.round(n)}k` : `${n.toFixed(1)}k`;
    }
    return Math.round(v).toString();
  });
  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);
  return (
    <span ref={ref}>
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}

export function StatsSection() {
  const stats = [
    { icon: <Calculator className="h-5 w-5" />, v: 5500, s: "+", l: "Practice MCQs" },
    { icon: <BookOpenIcon className="h-5 w-5" />, v: 300, s: "+", l: "Chapter Quizzes" },
    { icon: <FileText className="h-5 w-5" />, v: 100, s: "+", l: "Mock Exams" },
    { icon: <Landmark className="h-5 w-5" />, v: 16, s: "+", l: "ICAB Subjects" },
    { icon: <BarChart3 className="h-5 w-5" />, v: 24, s: "/7", l: "Performance Tracking" },
    { icon: <Users className="h-5 w-5" />, v: 1200, s: "+", l: "CA Students" },
  ];
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <BarChart3 className="h-3.5 w-3.5 text-accent" />,
            label: "By the numbers",
          }}
          title="Everything you need"
          gradient="for ICAB success."
          desc="Realistic content built around the ICAB syllabus — every MCQ, quiz and mock exam engineered for Bangladesh CA candidates."
        />
        <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((s, i) => (
            <Reveal key={s.l} delay={i * 0.06}>
              <div className="group glass shadow-soft relative overflow-hidden rounded-3xl border border-border p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-glow">
                <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-brand-gradient opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30" />
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow">
                  {s.icon}
                </div>
                <div
                  className="text-3xl font-bold tracking-tight text-gradient sm:text-4xl"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  <Counter value={s.v} suffix={s.s} />
                </div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   2. FEATURES SECTION
========================================================= */
function FeatureCard({
  icon,
  title,
  desc,
  accent,
  span = "md:col-span-4",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: string;
  span?: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal className={span}>
      <div className="group glass shadow-soft relative h-full overflow-hidden rounded-3xl border border-border p-8 transition-all duration-500 hover:-translate-y-1.5 hover:shadow-glow">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
          style={{ background: accent }}
        />
        <div
          className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow"
          style={{ background: accent }}
        >
          {icon}
        </div>
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{desc}</p>
        {children}
      </div>
    </Reveal>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 mx-auto h-[400px] max-w-6xl rounded-full bg-brand-gradient opacity-10 blur-[140px]" />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <Zap className="h-3.5 w-3.5 text-accent" />,
            label: "Everything you need",
          }}
          title="Every tool a CA candidate"
          gradient="actually needs."
          desc="Chapter-wise practice, custom exams, wrong-answer review, bookmarks, analytics and study streaks — purpose-built for the ICAB syllabus."
        />

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-6">
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="Chapter-wise MCQ Practice"
            desc="Attempt thousands of MCQs organised by ICAB subject and chapter — with instant scoring, explanations and difficulty progression."
            accent="linear-gradient(135deg, #4f46e5, #7c3aed)"
            span="md:col-span-4"
          >
            <div className="mt-8 flex items-end gap-1.5">
              {[35, 55, 40, 78, 60, 92, 82, 100, 88].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-1 rounded-t-lg bg-brand-gradient"
                  style={{ minHeight: 24, maxHeight: 140 }}
                />
              ))}
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<Trophy className="h-5 w-5" />}
            title="Leaderboard"
            desc="See where you stand among CA students across Bangladesh."
            accent="linear-gradient(135deg, #06b6d4, #3b82f6)"
            span="md:col-span-2"
          >
            <div className="mt-6 space-y-2">
              {["Rahim H.", "Tasnim A.", "You"].map((n, i) => (
                <div
                  key={n}
                  className={`flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs ${
                    i === 2 ? "bg-brand-gradient text-white" : "bg-card/60"
                  }`}
                >
                  <span className="font-medium">{n}</span>
                  <span className="font-semibold">{[1420, 1380, 1305][i]}</span>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<BookOpen className="h-5 w-5" />}
            title="Wrong Answer Review"
            desc="Every mistake is saved with clear explanations, so weak topics stop being weak."
            accent="linear-gradient(135deg, #10b981, #06b6d4)"
            span="md:col-span-2"
          />

          <FeatureCard
            icon={<Bookmark className="h-5 w-5" />}
            title="Bookmarks & Custom Exams"
            desc="Save tricky questions and generate custom exams from your bookmarked question bank."
            accent="linear-gradient(135deg, #f59e0b, #ef4444)"
            span="md:col-span-2"
          >
            <div className="mt-6 flex -space-x-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-9 w-9 rounded-full border-2 border-card bg-brand-gradient"
                  style={{ opacity: 1 - i * 0.15 }}
                />
              ))}
              <div className="ml-2 flex h-9 items-center rounded-full border-2 border-card bg-secondary px-2.5 text-[10px] font-semibold">
                +5,500 MCQs
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Real Exam Simulation"
            desc="Full-length, timed mock examinations that mirror the real ICAB paper — right down to the pressure."
            accent="linear-gradient(135deg, #7c3aed, #ec4899)"
            span="md:col-span-2"
          />
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   3. WHY CL ASPIRE — Comparison + Timeline
========================================================= */
export function WhyAspireSection() {
  const rows = [
    { l: "Chapter-wise ICAB MCQ practice", a: true, o: false },
    { l: "Realistic mock examinations", a: true, o: false },
    { l: "Detailed performance analytics", a: true, o: "basic" },
    { l: "Weak topic detection", a: true, o: false },
    { l: "Wrong answer review & bookmarks", a: true, o: "basic" },
    { l: "Study progress & streak tracking", a: true, o: false },
  ];

  const timeline = [
    {
      t: "Day 1",
      h: "Assess",
      d: "Take a short diagnostic to map your ICAB Certificate Level readiness across every subject.",
    },
    {
      t: "Week 1",
      h: "Practice",
      d: "Work through chapter-wise MCQs across Accounting, Assurance, Taxation, Business & Finance and more.",
    },
    {
      t: "Week 4",
      h: "Refine",
      d: "Review every wrong answer, revisit weak chapters and build a consistent daily study streak.",
    },
    {
      t: "Exam Day",
      h: "Perform",
      d: "Walk into your ICAB examination hall prepared, timed and confident.",
    },
  ];

  return (
    <section id="about" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <Sparkles className="h-3.5 w-3.5 text-accent" />,
            label: "Why CL Aspire",
          }}
          title="Built for ICAB."
          gradient="Made in Bangladesh."
          desc="Compare CL Aspire with generic study apps — then decide what your CA preparation deserves."
        />

        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Comparison */}
          <Reveal>
            <div className="glass shadow-soft h-full overflow-hidden rounded-3xl border border-border p-6 sm:p-8">
              <div className="mb-6 grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border pb-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Capability
                </div>
                <div className="rounded-full bg-brand-gradient px-3 py-1 text-[10px] font-semibold text-white shadow-glow">
                  CL Aspire
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  Others
                </div>
              </div>
              <div className="space-y-1">
                {rows.map((r, i) => (
                  <motion.div
                    key={r.l}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.06 }}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-2xl px-3 py-3.5 text-sm transition-colors hover:bg-secondary/60"
                  >
                    <div className="font-medium">{r.l}</div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </div>
                    <div
                      className={`flex h-7 min-w-7 items-center justify-center rounded-full border border-border px-2 text-[10px] font-semibold ${
                        r.o === false ? "text-destructive" : "text-warning"
                      }`}
                    >
                      {r.o === false ? <X className="h-3.5 w-3.5" strokeWidth={3} /> : "Basic"}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Timeline */}
          <Reveal delay={0.1}>
            <div className="glass shadow-soft h-full rounded-3xl border border-border p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Target className="h-3.5 w-3.5 text-accent" />
                Your journey with us
              </div>
              <div className="relative">
                <div className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-primary/60 via-accent/60 to-transparent" />
                <div className="space-y-8">
                  {timeline.map((t, i) => (
                    <motion.div
                      key={t.t}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                      className="relative pl-14"
                    >
                      <div className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-bold text-white shadow-glow">
                        {i + 1}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                        {t.t}
                      </div>
                      <div className="mt-1 text-lg font-semibold tracking-tight">{t.h}</div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.d}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   4. LEARNING EXPERIENCE — Interactive tabs + mockups
========================================================= */
export function LearningExperienceSection() {
  const tabs = [
    {
      k: "practice",
      label: "MCQ Practice",
      icon: <ListChecks className="h-4 w-4" />,
      title: "Practice chapter by chapter",
      desc: "Attempt ICAB-aligned MCQs organised by subject and chapter, with instant scoring and explanations.",
    },
    {
      k: "live",
      label: "Timed Quiz",
      icon: <Clock className="h-4 w-4" />,
      title: "Attempt real exam-style quizzes",
      desc: "Timed chapter quizzes recreate exam pressure so speed and accuracy improve together.",
    },
    {
      k: "exam",
      label: "Mock Exams",
      icon: <FileText className="h-4 w-4" />,
      title: "Prepare confidently for ICAB",
      desc: "Full-length ICAB Certificate Level mock papers, timed and analysed the moment you submit.",
    },
    {
      k: "coach",
      label: "Answer Review",
      icon: <Brain className="h-4 w-4" />,
      title: "Analyse your mistakes",
      desc: "Every wrong answer is explained clearly — so weak topics stop repeating themselves.",
    },
  ];
  const [active, setActive] = useState(0);
  const tab = tabs[active];

  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <BookOpen className="h-3.5 w-3.5 text-accent" />,
            label: "The study experience",
          }}
          title="Every study session,"
          gradient="engineered for ICAB."
        />

        {/* Tabs */}
        <Reveal delay={0.1}>
          <div className="mt-12 flex flex-wrap justify-center gap-2">
            {tabs.map((t, i) => (
              <button
                key={t.k}
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300 ${
                  i === active
                    ? "border-transparent bg-brand-gradient text-white shadow-glow"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <motion.div
                key={tab.k}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                  {tab.label}
                </div>
                <h3
                  className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}
                >
                  {tab.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">{tab.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {["Chapter-wise organisation", "Instant explanations", "Detailed analytics"].map(
                    (f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-gradient text-white">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ),
                  )}
                </ul>
              </motion.div>
            </div>

            {/* Mockup */}
            <div className="relative lg:col-span-8">
              <motion.div
                key={tab.k + "-mock"}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="glass shadow-glow relative overflow-hidden rounded-3xl border border-border"
              >
                <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-brand-gradient opacity-25 blur-3xl" />
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
                  <div className="ml-3 text-[10px] font-medium text-muted-foreground">
                    claspire.com / {tab.k}
                  </div>
                </div>

                {tab.k === "practice" && (
                  <div className="p-6">
                    <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Q. 12 · Financial Accounting · IAS 2 Inventories</span>
                      <span className="text-warning font-semibold">00:42</span>
                    </div>
                    <div className="mb-5 text-lg font-semibold tracking-tight">
                      As per IAS 2, inventories should be measured at the lower of cost and which of
                      the following?
                    </div>
                    <div className="space-y-2">
                      {[
                        { l: "A", t: "Net realisable value", s: "correct" },
                        { l: "B", t: "Fair value", s: "default" },
                        { l: "C", t: "Replacement cost", s: "default" },
                        { l: "D", t: "Historical cost", s: "wrong" },
                      ].map((o) => (
                        <div
                          key={o.l}
                          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                            o.s === "correct"
                              ? "border-success bg-success/10"
                              : o.s === "wrong"
                                ? "border-destructive bg-destructive/10"
                                : "border-border bg-card/60"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold">
                              {o.l}
                            </span>
                            <span>{o.t}</span>
                          </div>
                          {o.s === "correct" && <Check className="h-4 w-4 text-success" />}
                          {o.s === "wrong" && <X className="h-4 w-4 text-destructive" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab.k === "live" && (
                  <div className="grid grid-cols-12 gap-4 p-5">
                    <div className="col-span-8 aspect-video rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500 relative overflow-hidden">
                      <div className="absolute inset-0 grid-pattern opacity-30" />
                      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
                        · 320 attempting
                      </div>
                      <div className="absolute left-3 bottom-3 text-white">
                        <div className="text-sm font-semibold">
                          Assurance · Timed Quiz · Chapter 5
                        </div>
                        <div className="text-[10px] opacity-80">30 MCQs · 30 minutes</div>
                      </div>
                    </div>
                    <div className="col-span-4 space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Live activity
                      </div>
                      {[
                        { n: "Rahim", m: "Finished 20/30 — going strong." },
                        { n: "Nabila", m: "Q14 was tricky. IAS 37!" },
                        { n: "Tasnim", m: "Submitted. Aiming for top 10." },
                        { n: "You", m: "On Q22. Focused." },
                      ].map((c, i) => (
                        <div
                          key={i}
                          className="rounded-xl bg-card/60 border border-border px-2.5 py-2"
                        >
                          <div className="text-[10px] font-semibold text-gradient">{c.n}</div>
                          <div className="text-xs">{c.m}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab.k === "exam" && (
                  <div className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Mock exam
                        </div>
                        <div className="text-lg font-semibold tracking-tight">
                          ICAB Certificate Level · Full Mock
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card/60 px-4 py-2 text-center">
                        <div className="text-[9px] text-muted-foreground">Time left</div>
                        <div className="text-lg font-bold text-gradient tabular-nums">01:24:12</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-10 gap-1.5">
                      {Array.from({ length: 60 }).map((_, i) => {
                        const state =
                          i < 22 ? "done" : i < 26 ? "mark" : i === 26 ? "curr" : "todo";
                        return (
                          <div
                            key={i}
                            className={`flex h-8 items-center justify-center rounded-md text-[10px] font-semibold ${
                              state === "done"
                                ? "bg-brand-gradient text-white"
                                : state === "mark"
                                  ? "bg-warning/20 text-warning border border-warning/40"
                                  : state === "curr"
                                    ? "bg-accent text-white ring-2 ring-accent/40"
                                    : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {i + 1}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-brand-gradient" /> Answered
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-warning" /> Marked
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-accent" /> Current
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-secondary" /> To-do
                      </span>
                    </div>
                  </div>
                )}

                {tab.k === "coach" && (
                  <div className="space-y-3 p-6">
                    {[
                      { r: "you", t: "Why is depreciation charged on cost less residual value?" },
                      {
                        r: "coach",
                        t: "Under IAS 16, depreciation allocates the depreciable amount — cost minus residual value — over the asset's useful life. You only expense the portion the business is expected to consume.",
                      },
                      { r: "you", t: "Quick example?" },
                      {
                        r: "coach",
                        t: "Machine cost Tk 100,000, residual value Tk 10,000, useful life 5 years. Annual depreciation = (100,000 − 10,000) ÷ 5 = Tk 18,000.",
                      },
                    ].map((m, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 }}
                        className={`flex ${m.r === "you" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                            m.r === "you"
                              ? "bg-brand-gradient text-white"
                              : "border border-border bg-card/70"
                          }`}
                        >
                          {m.t}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* =========================================================
   5. PROGRESS TRACKING PREVIEW
========================================================= */
function Ring({
  value,
  size = 120,
  stroke = 10,
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  sub: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ref = useRef<SVGCircleElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className="stroke-secondary"
            fill="none"
          />
          <motion.circle
            ref={ref}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            stroke={`url(#grad-${label})`}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: inView ? c - (c * value) / 100 : c }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold tracking-tight text-gradient">{value}%</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function AreaChart() {
  const points = [10, 25, 20, 40, 35, 55, 48, 70, 62, 82, 76, 92];
  const w = 480;
  const h = 160;
  const step = w / (points.length - 1);
  const max = 100;
  const coords = points.map((p, i) => [i * step, h - (p / max) * h] as [number, number]);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill="url(#area-grad)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.path
        d={path}
        stroke="url(#line-grad)"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
      {coords.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={3}
          fill="#7c3aed"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 + i * 0.05 }}
        />
      ))}
    </svg>
  );
}

export function ProgressPreviewSection() {
  const activity = [
    {
      icon: <Trophy className="h-3.5 w-3.5" />,
      t: "Ranked #128 on weekly leaderboard",
      ago: "2h ago",
      accent: "bg-brand-gradient",
    },
    {
      icon: <Flame className="h-3.5 w-3.5" />,
      t: "42-day study streak unlocked",
      ago: "6h ago",
      accent: "bg-gradient-to-br from-amber-500 to-red-500",
    },
    {
      icon: <Award className="h-3.5 w-3.5" />,
      t: "Financial Accounting · Ch. 4 · 92%",
      ago: "1d ago",
      accent: "bg-gradient-to-br from-emerald-500 to-teal-500",
    },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      t: "Mock scheduled · ICAB Certificate Level",
      ago: "2d ago",
      accent: "bg-gradient-to-br from-cyan-500 to-blue-600",
    },
  ];
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <Activity className="h-3.5 w-3.5 text-accent" />,
            label: "Progress tracking",
          }}
          title="See your ICAB prep"
          gradient="improve, day by day."
          desc="Daily progress, weekly performance, accuracy, average score and study streak — all in one calm dashboard."
        />

        <Reveal>
          <div className="mt-16 grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Big analytics card */}
            <div className="glass shadow-soft relative overflow-hidden rounded-3xl border border-border p-6 sm:p-8 lg:col-span-8">
              <div className="pointer-events-none absolute -top-32 -right-32 h-72 w-72 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Overall performance
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="text-4xl font-bold tracking-tight text-gradient">
                      <Counter value={87} suffix="%" />
                    </div>
                    <div className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                      +12.4%
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Last 12 weeks</div>
                </div>
                <div className="hidden gap-2 sm:flex">
                  {["1W", "1M", "3M", "12M"].map((r, i) => (
                    <button
                      key={r}
                      className={`rounded-lg px-3 py-1 text-[11px] font-semibold ${
                        i === 3
                          ? "bg-brand-gradient text-white"
                          : "border border-border bg-card/60 text-muted-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <AreaChart />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { l: "Accuracy", v: 92 },
                  { l: "Avg. Score", v: 78 },
                  { l: "Completion", v: 84 },
                ].map((s, i) => (
                  <div key={s.l} className="rounded-2xl border border-border bg-card/60 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.l}
                    </div>
                    <div className="mt-1 text-xl font-bold text-gradient">{s.v}%</div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${s.v}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.1, delay: 0.2 + i * 0.1 }}
                        className="h-full rounded-full bg-brand-gradient"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rings + activity */}
            <div className="flex flex-col gap-5 lg:col-span-4">
              <div className="glass shadow-soft rounded-3xl border border-border p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div className="text-sm font-semibold">Today's goals</div>
                  <div className="text-[10px] text-muted-foreground">3 rings</div>
                </div>
                <div className="grid grid-cols-3 gap-2 place-items-center">
                  <Ring value={82} label="Study" sub="4h 6m" size={96} stroke={8} />
                  <Ring value={64} label="Practice" sub="52 MCQs" size={96} stroke={8} />
                  <Ring value={95} label="Streak" sub="42 days" size={96} stroke={8} />
                </div>
              </div>

              <div className="glass shadow-soft flex-1 rounded-3xl border border-border p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">Activity</div>
                  <a className="text-[11px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground cursor-pointer">
                    View all <ArrowRight className="h-3 w-3" />
                  </a>
                </div>
                <div className="relative space-y-4">
                  <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" />
                  {activity.map((a, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: i * 0.08 }}
                      className="relative flex items-start gap-3 pl-0"
                    >
                      <div
                        className={`relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full text-white ${a.accent} shadow-glow`}
                      >
                        {a.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium leading-snug">{a.t}</div>
                        <div className="text-[10px] text-muted-foreground">{a.ago}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

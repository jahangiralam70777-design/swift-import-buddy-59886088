import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Star,
  Plus,
  ArrowRight,
  Check,
  Sparkles,
  Mail,
  Twitter,
  Github,
  Linkedin,
  Instagram,
  Youtube,
  HelpCircle,
  Quote,
} from "lucide-react";

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
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

/* ---------- Avatar (deterministic gradient) ---------- */
const AVATAR_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-red-600",
];
function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const gradient = AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
  return (
    <div
      className={`relative flex flex-none items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-semibold text-white shadow-glow`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
    </div>
  );
}

/* =========================================================
   TESTIMONIALS — Auto-sliding carousel
========================================================= */
const TESTIMONIALS = [
  {
    q: "The chapter-wise MCQs match the ICAB syllabus exactly. My Certificate Level preparation finally has a proper structure.",
    n: "Tasnim Ahmed",
    r: "ICAB Certificate Level Student",
  },
  {
    q: "Balancing articleship and studies is brutal. CL Aspire's timed quizzes let me practice in 30-minute focused sessions.",
    n: "Rahim Hossain",
    r: "Articleship Student, Dhaka",
  },
  {
    q: "The mock exams feel exactly like the real ICAB paper. Walking into my last exam, I already knew what to expect.",
    n: "Nabila Rahman",
    r: "Professional Level Candidate",
  },
  {
    q: "The wrong-answer review is what changed everything for me. My weak topics in Taxation are finally not weak anymore.",
    n: "Farhan Chowdhury",
    r: "Pre-Articleship Student",
  },
  {
    q: "Performance analytics show me exactly where I'm losing marks. No other platform for Bangladesh CA students does this.",
    n: "Sadia Islam",
    r: "Advanced Level Student",
  },
  {
    q: "Practising 30 MCQs before bed became my routine. The daily streak keeps me consistent, even during peak audit season.",
    n: "Imran Kabir",
    r: "Articleship Student, Chattogram",
  },
];

function TestimonialCard({ t }: { t: (typeof TESTIMONIALS)[number] }) {
  return (
    <div className="glass shadow-soft h-full flex flex-col rounded-3xl border border-border p-7 sm:p-8">
      <Quote className="h-6 w-6 text-accent" />
      <p
        className="mt-5 flex-1 text-base leading-relaxed sm:text-lg"
        style={{ letterSpacing: "-0.005em" }}
      >
        {t.q}
      </p>
      <div className="mt-6 flex gap-0.5">
        {[0, 1, 2, 3, 4].map((s) => (
          <Star key={s} className="h-3.5 w-3.5 fill-warning text-warning" />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        <Avatar name={t.n} />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t.n}</div>
          <div className="text-xs text-muted-foreground truncate">{t.r}</div>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const items = [...TESTIMONIALS, ...TESTIMONIALS];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    let last = performance.now();
    const speed = 0.04; // px per ms
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused) {
        track.scrollLeft += speed * dt;
        const half = track.scrollWidth / 2;
        if (track.scrollLeft >= half) track.scrollLeft -= half;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <Sparkles className="h-3.5 w-3.5 text-accent" />,
            label: "Loved by CA students",
          }}
          title="Trusted by Bangladesh"
          gradient="ICAB candidates."
          desc="Real words from Certificate, Professional and Advanced Level students preparing across Bangladesh."
        />
      </div>

      <div
        className="relative mt-14"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

        <div
          ref={trackRef}
          className="scrollbar-none flex gap-5 overflow-x-hidden px-6 pb-2"
          style={{ scrollBehavior: "auto" }}
        >
          {items.map((t, i) => (
            <div key={i} className="w-[86vw] flex-none sm:w-[420px]">
              <TestimonialCard t={t} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FAQ — Animated accordion
========================================================= */
const FAQS = [
  {
    q: "How do I start practicing on CL Aspire?",
    a: "Create your free account, pick your ICAB level — Certificate, Professional or Advanced — and begin with any chapter of any subject. Every MCQ is scored instantly with a clear explanation.",
  },
  {
    q: "Are the questions organised chapter-wise?",
    a: "Yes. Every MCQ, quiz and mock exam is mapped to a specific ICAB subject and chapter, so you can drill exactly what you're studying that week.",
  },
  {
    q: "Can I track my study progress?",
    a: "Absolutely. Your dashboard shows daily progress, weekly performance, monthly reports, accuracy, average score, completion rate, study streak and time spent studying.",
  },
  {
    q: "Can I practice unlimited times?",
    a: "Yes. Every MCQ and quiz can be attempted as many times as you need. You can also review only your bookmarked or previously wrong questions.",
  },
  {
    q: "Can I attempt full mock examinations?",
    a: "Yes. Full-length, timed mock exams mirror the real ICAB paper for Certificate, Professional and Advanced Level, with detailed performance analytics on submission.",
  },
  {
    q: "Does CL Aspire work on mobile?",
    a: "Yes — the entire platform is fully responsive on mobile, tablet, laptop and desktop, so you can practise during commutes, breaks or between articleship hours.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={{
            icon: <HelpCircle className="h-3.5 w-3.5 text-accent" />,
            label: "Frequently asked",
          }}
          title="Everything CA students"
          gradient="usually ask."
        />

        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.04}>
                <div
                  className={`glass shadow-soft overflow-hidden rounded-2xl border transition-colors duration-300 ${
                    isOpen ? "border-primary/40" : "border-border"
                  }`}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-base font-semibold tracking-tight sm:text-lg">{f.q}</span>
                    <span
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full transition-all duration-500 ${
                        isOpen
                          ? "rotate-45 bg-brand-gradient text-white shadow-glow"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                          {f.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FINAL CTA
========================================================= */
export function FinalCTA() {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-border p-10 text-center shadow-glow sm:p-16">
            {/* Animated gradient background */}
            <div className="absolute inset-0 -z-10 bg-brand-gradient animate-gradient" />
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 grid-pattern" />
            {/* Blur orbs */}
            <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-white/40 blur-3xl" />
            <div className="pointer-events-none absolute -right-32 -bottom-32 h-72 w-72 rounded-full bg-white/30 blur-3xl" />
            {/* Light ray */}
            <div
              className="pointer-events-none absolute left-1/2 top-0 h-full w-[1000px] -translate-x-1/2 opacity-20 mix-blend-screen"
              style={{
                background:
                  "conic-gradient(from 200deg at 50% 0%, transparent 0deg, #fff 20deg, transparent 60deg, transparent 300deg, #fff 340deg, transparent 360deg)",
                filter: "blur(30px)",
              }}
            />

            <div className="glass mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Sparkles className="h-3 w-3" /> Start in under 60 seconds
            </div>

            <h2
              className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.035em", lineHeight: 1.02 }}
            >
              Build the skills that
              <br /> compound for a lifetime.
            </h2>

            <p className="mx-auto mt-6 max-w-xl text-base text-white/85 sm:text-lg">
              Start free today. Upgrade when we've earned it. Cancel anytime.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <button className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-foreground shadow-soft transition-all duration-300 hover:scale-[1.03] hover:shadow-glow">
                Start Learning Free
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
              <button className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:bg-white/20">
                Talk to our team
              </button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/85">
              {["No credit card required", "Free forever plan", "Cancel anytime"].map((f) => (
                <div key={f} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" /> {f}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* =========================================================
   FOOTER
========================================================= */
export function Footer() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const cols = [
    {
      title: "Platform",
      links: ["Features", "MCQ Practice", "Chapter Quizzes", "Mock Exams", "Question Bank"],
    },
    {
      title: "ICAB Levels",
      links: [
        "Certificate Level",
        "Professional Level",
        "Advanced Level",
        "Pre-Articleship",
        "Articleship",
      ],
    },
    {
      title: "Resources",
      links: ["Study Guides", "Blog", "Student Community", "Help Centre", "Status"],
    },
    { title: "Company", links: ["About", "Contact", "Privacy", "Terms", "Cookies"] },
  ];
  const socials = [
    { icon: <Twitter className="h-4 w-4" />, label: "Twitter" },
    { icon: <Instagram className="h-4 w-4" />, label: "Instagram" },
    { icon: <Youtube className="h-4 w-4" />, label: "YouTube" },
    { icon: <Linkedin className="h-4 w-4" />, label: "LinkedIn" },
    { icon: <Github className="h-4 w-4" />, label: "GitHub" },
  ];

  return (
    <footer id="contact" className="relative border-t border-border pt-20 pb-10">
      <div className="pointer-events-none absolute inset-x-0 -top-px mx-auto h-px w-3/5 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-4xl rounded-full bg-brand-gradient opacity-10 blur-[120px]" />

      <div className="mx-auto max-w-7xl px-6">
        {/* Newsletter */}
        <Reveal>
          <div className="glass shadow-soft mb-20 flex flex-col items-start justify-between gap-6 rounded-3xl border border-border p-8 md:flex-row md:items-center md:p-10">
            <div className="max-w-md">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-accent">
                Newsletter
              </div>
              <h3
                className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                style={{ letterSpacing: "-0.025em" }}
              >
                ICAB study insights, monthly.
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                New question sets, ICAB updates, study strategies and stories from CA students
                across Bangladesh. No spam. Ever.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setSent(true);
              }}
              className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
            >
              <div className="glass relative flex-1 rounded-full border border-border">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSent(false);
                  }}
                  placeholder="you@example.com"
                  className="w-full bg-transparent py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="submit"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-glow transition-transform duration-300 hover:scale-[1.03]"
              >
                {sent ? (
                  <>
                    <Check className="h-4 w-4" /> Subscribed
                  </>
                ) : (
                  <>
                    Subscribe
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </Reveal>

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6 md:gap-8">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
                <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-lg font-bold tracking-tight">CL Aspire</span>
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  ICAB · Bangladesh
                </span>
              </div>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Bangladesh's premium practice platform for ICAB CA students — chapter-wise MCQs, timed
              quizzes, mock examinations and performance analytics in one calm dashboard.
            </p>
            <div className="mt-6 flex gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="glass inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:text-foreground hover:shadow-glow"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {c.title}
              </div>
              <ul className="mt-5 space-y-3">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="group inline-flex items-center gap-1 text-sm text-foreground/80 transition-colors duration-300 hover:text-foreground"
                    >
                      {l}
                      <ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Wordmark */}
        <div className="relative mt-20 select-none overflow-hidden">
          <div
            className="text-gradient text-center font-black leading-none tracking-tighter opacity-[0.09]"
            style={{ fontSize: "clamp(4rem, 16vw, 14rem)", letterSpacing: "-0.06em" }}
          >
            CL ASPIRE
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8">
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CL Aspire. Built in Bangladesh for ICAB CA students.
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> All systems
              normal
            </span>
            <span>v1.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

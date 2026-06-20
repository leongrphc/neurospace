import type { AnalysisStatus, TrendDirection } from "@/lib/analysis-engine";

type Accent = "indigo" | "purple" | "cyan" | "green" | "amber" | "red";
type Tone = "default" | "quiet" | "strong";

const ACCENT_CLASSES: Record<Accent, { text: string; glow: string; chip: string }> = {
  indigo: {
    text: "text-indigo-600 dark:text-indigo-300",
    glow: "from-indigo-500/[0.18] to-indigo-500/0",
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
  purple: {
    text: "text-purple-600 dark:text-purple-300",
    glow: "from-purple-500/[0.18] to-purple-500/0",
    chip: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  },
  cyan: {
    text: "text-cyan-600 dark:text-cyan-300",
    glow: "from-cyan-500/[0.18] to-cyan-500/0",
    chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
  },
  green: {
    text: "text-emerald-600 dark:text-emerald-300",
    glow: "from-emerald-500/[0.18] to-emerald-500/0",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-300",
    glow: "from-amber-500/20 to-amber-500/0",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  },
  red: {
    text: "text-rose-600 dark:text-rose-300",
    glow: "from-rose-500/[0.18] to-rose-500/0",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
  },
};

export function StatCard({
  label,
  value,
  sub,
  accent = "indigo",
  icon,
  caption,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: Accent;
  icon?: string;
  caption?: string;
  tone?: Tone;
}) {
  const accentStyle = ACCENT_CLASSES[accent];

  return (
    <div
      className={`ns-card ns-card-hover relative overflow-hidden ${
        tone === "quiet" ? "shadow-none" : ""
      } ${tone === "strong" ? "border-cyan-200/80 dark:border-cyan-300/20" : ""}`}
    >
      <div
        className={`pointer-events-none absolute -right-14 -top-16 h-32 w-32 rounded-full bg-gradient-to-b ${accentStyle.glow} blur-2xl`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {label}
          </div>
          <div className={`mt-2 text-3xl font-black tracking-tight ${accentStyle.text}`}>
            {value}
          </div>
          {(sub || caption) && (
            <div className="mt-2 space-y-1">
              {sub && <div className="text-xs font-medium text-slate-500">{sub}</div>}
              {caption && <div className="text-[11px] text-slate-400">{caption}</div>}
            </div>
          )}
        </div>
        {icon && (
          <div className={`rounded-2xl px-3 py-2 text-lg ${accentStyle.chip}`} aria-hidden>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<AnalysisStatus, { label: string; cls: string; dot: string }> = {
  INSUFFICIENT_DATA: {
    label: "Yetersiz veri",
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  OPTIMAL: {
    label: "Optimal",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    dot: "bg-emerald-400",
  },
  SLIGHTLY_DISTRACTED: {
    label: "Hafif dağınık",
    cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
    dot: "bg-cyan-400",
  },
  WARNING: {
    label: "Uyarı",
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
    dot: "bg-amber-400",
  },
  FATIGUED: {
    label: "Yorgun",
    cls: "bg-rose-500/10 text-rose-700 dark:text-rose-200",
    dot: "bg-rose-400",
  },
  RECOVERING: {
    label: "Toparlanıyor",
    cls: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-200",
    dot: "bg-indigo-400",
  },
};

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.INSUFFICIENT_DATA;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

const TREND_STYLE: Record<
  TrendDirection,
  { label: string; arrow: string; cls: string }
> = {
  recovering: {
    label: "Yükselişte",
    arrow: "↗",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  },
  declining: {
    label: "Düşüşte",
    arrow: "↘",
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-200",
  },
  stable: {
    label: "Stabil",
    arrow: "→",
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  unknown: {
    label: "Belirsiz",
    arrow: "·",
    cls: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
  },
};

export function TrendBadge({ trend }: { trend: TrendDirection }) {
  const t = TREND_STYLE[trend] ?? TREND_STYLE.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${t.cls}`}
      title="Son ölçümlerin eğilimi"
    >
      <span aria-hidden>{t.arrow}</span>
      {t.label}
    </span>
  );
}

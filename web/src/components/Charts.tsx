"use client";

/**
 * Recharts tabanlı grafik bileşenleri.
 * Tüm grafikler yalnızca anonim metrikleri görselleştirir.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourPoint, DayPoint } from "@/lib/demo-data";

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ns-card ns-card-hover relative overflow-hidden">
      <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl" />
      <div className="relative mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          anonim
        </span>
      </div>
      <div className="relative h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const AXIS = { stroke: "#94a3b8", fontSize: 12, fontWeight: 600 };
const GRID = "#94a3b8";
const TOOLTIP = {
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.94)",
  color: "#fff",
  boxShadow: "0 24px 60px rgba(2,6,23,0.32)",
};

export function ScoreAreaChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartCard
      title="Gün İçi Bilişsel Skor"
      description="0-100 arası skor; içerik değil ritim sinyalleri kullanılır."
    >
      <AreaChart
        data={data}
        margin={{ left: -10, right: 8, top: 8, bottom: 0 }}
      >
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
            <stop offset="55%" stopColor="#6366f1" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, 100]}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ stroke: "#22d3ee", strokeOpacity: 0.3 }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#22d3ee"
          strokeWidth={3}
          fill="url(#scoreGrad)"
          name="Skor"
          activeDot={{
            r: 5,
            fill: "#22d3ee",
            stroke: "#0f172a",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ChartCard>
  );
}

export function FlightTimeChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartCard
      title="Ortalama Tuş Arası Süre"
      description="Yavaşlayan ritim, yorgunluk veya dikkat dağınıklığı sinyali olabilir."
    >
      <LineChart
        data={data}
        margin={{ left: -10, right: 8, top: 8, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ stroke: "#818cf8", strokeOpacity: 0.28 }}
        />
        <Line
          type="monotone"
          dataKey="mean_flight_ms"
          stroke="#818cf8"
          strokeWidth={3}
          dot={false}
          activeDot={{
            r: 5,
            fill: "#818cf8",
            stroke: "#0f172a",
            strokeWidth: 2,
          }}
          name="ms"
        />
      </LineChart>
    </ChartCard>
  );
}

export function BackspaceChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartCard
      title="Backspace Oranı"
      description="Düzeltme yoğunluğu arttığında panel erken uyarı üretir."
    >
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
        />
        <Bar
          dataKey="backspace_percentage"
          fill="#a78bfa"
          radius={[8, 8, 2, 2]}
          name="%"
        />
      </BarChart>
    </ChartCard>
  );
}

export function ActiveTypingChart({ data }: { data: HourPoint[] }) {
  return (
    <ChartCard
      title="Aktif Yazma Süresi"
      description="Pencere başına aktif yazma yoğunluğu; ham tuş listesi saklanmaz."
    >
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="hour" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ fill: "rgba(34,211,238,0.08)" }}
        />
        <Bar
          dataKey="active_typing_seconds"
          fill="#22d3ee"
          radius={[8, 8, 2, 2]}
          name="sn"
        />
      </BarChart>
    </ChartCard>
  );
}

export function WeeklyScoreChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartCard
      title="Haftalık Skor Trendi"
      description="Son 7 günün ortalama bilişsel enerji görünümü."
    >
      <LineChart
        data={data}
        margin={{ left: -10, right: 8, top: 8, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis
          domain={[0, 100]}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ stroke: "#22d3ee", strokeOpacity: 0.3 }}
        />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="#22d3ee"
          strokeWidth={3}
          dot={{ r: 4, fill: "#0f172a", stroke: "#22d3ee", strokeWidth: 2 }}
          activeDot={{
            r: 6,
            fill: "#22d3ee",
            stroke: "#0f172a",
            strokeWidth: 2,
          }}
          name="Ort. Skor"
        />
      </LineChart>
    </ChartCard>
  );
}

export function WeeklyActiveChart({ data }: { data: DayPoint[] }) {
  return (
    <ChartCard
      title="Haftalık Aktif Yazma"
      description="Gün bazında toplam aktif yazma dakikası."
    >
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="4 8"
          stroke={GRID}
          opacity={0.22}
          vertical={false}
        />
        <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={TOOLTIP}
          cursor={{ fill: "rgba(129,140,248,0.08)" }}
        />
        <Bar
          dataKey="activeMinutes"
          fill="#818cf8"
          radius={[8, 8, 2, 2]}
          name="dk"
        />
      </BarChart>
    </ChartCard>
  );
}

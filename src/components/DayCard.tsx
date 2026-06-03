"use client";

import type { DayForecast } from "@/lib/types";

const badgeColors: Record<string, { bg: string; fg: string }> = {
  today:    { bg: "rgba(34,197,94,0.12)",  fg: "#4ADE80" },
  tomorrow: { bg: "rgba(59,130,246,0.12)", fg: "#60A5FA" },
  plus2:    { bg: "rgba(234,179,8,0.12)",  fg: "#FACC15" },
  plus3:    { bg: "rgba(168,85,247,0.12)", fg: "#C084FC" },
};

const aqiMap: Record<number, { label: string; color: string }> = {
  1: { label: "Good", color: "#4ADE80" },
  2: { label: "Fair", color: "#FACC15" },
  3: { label: "Moderate", color: "#FB923C" },
  4: { label: "Poor", color: "#F87171" },
  5: { label: "V.Poor", color: "#FCA5A5" },
};

interface DayCardProps {
  day: DayForecast;
}

export default function DayCard({ day }: DayCardProps) {
  const badge = badgeColors[day.cls] || badgeColors.today;
  const aq = aqiMap[day.aqi] || aqiMap[1];

  const row1 = day.hourly.slice(0, 3);
  const row2 = day.hourly.slice(3);

  return (
    <div className="day-card flex flex-col justify-between rounded-[14px] border border-white/6 bg-bg-card p-[10px_12px] min-h-0">
      {/* Header: badge + temp */}
      <div className="day-header flex items-center justify-between shrink-0 mb-1.5">
        <span
          className="day-badge text-[0.65rem] font-extrabold uppercase tracking-[0.8px] px-2.5 py-0.75 rounded-md"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {day.label}
        </span>
        <div className="day-temp flex items-center gap-1.5">
              <i className={`fa-solid ${day.icon}`} style={{ fontSize: "1.1rem", color: day.icolor }} />
              <span className="text-[1.3rem] font-extrabold text-white">{day.temp}</span>
        </div>
      </div>

      {/* Hourly strip */}
      <div className="hourly-wrap flex-1 flex flex-col justify-center gap-1.5 bg-[#1a1a1a] rounded-[10px] p-[8px_6px] mb-1.5 min-h-0">
        <div className="h-row flex justify-around items-center min-h-0">
          {row1.map((slot, i) => (
            <div key={i} className="h flex flex-col items-center gap-0.5 flex-1">
              <span className="h-time text-[0.6rem] font-bold text-text-muted">{slot.time}</span>
              <i className={`h-icon fa-solid ${slot.icon}`} style={{ fontSize: "0.85rem", color: slot.color }} />
              <span className="h-temp text-[0.7rem] font-bold text-[#e2e8f0]">{slot.temp}</span>
            </div>
          ))}
        </div>
        <div className="h-row flex justify-around items-center min-h-0">
          {row2.map((slot, i) => (
            <div key={i} className="h flex flex-col items-center gap-0.5 flex-1">
              <span className="h-time text-[0.6rem] font-bold text-text-muted">{slot.time}</span>
              <i className={`h-icon fa-solid ${slot.icon}`} style={{ fontSize: "0.85rem", color: slot.color }} />
              <span className="h-temp text-[0.7rem] font-bold text-[#e2e8f0]">{slot.temp}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: wind + AQI */}
      <div className="card-footer flex justify-between text-[0.75rem] text-text-secondary shrink-0 font-semibold">
        <span className="flex items-center gap-1">
          <i className="fa-solid fa-wind text-[0.75rem] text-text-muted" />
          {day.wind} km/h
        </span>
        <span className="flex items-center gap-1" style={{ color: aq.color }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: aq.color }} />
          AQI {day.aqi} {aq.label}
        </span>
      </div>
    </div>
  );
}

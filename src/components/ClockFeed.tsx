"use client";

import { useEffect, useRef } from "react";
import type { ClockEvent } from "@/lib/types";

interface ClockFeedProps {
  events: ClockEvent[];
}

export default function ClockFeed({ events }: ClockFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll carousel ──
  // Scroll to top when the event count changes (new events arrived or were deleted)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  }, [events.length]);

  // Continuous upward scroll — when bottom is reached, loop back to top
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || events.length <= 1) return;

    const interval = setInterval(() => {
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (el.scrollTop >= maxScroll - 1) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ top: 1 });
      }
    }, 80);

    return () => clearInterval(interval);
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
        No clock-in records today
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-hidden flex flex-col gap-2.5 min-h-0 px-[10px] py-[14px]"
    >
      {events.map((ev, i) => (
        <div
          key={ev.id ?? i}
          className="clock-item flex items-center gap-3.5 py-3 px-4 rounded-2xl bg-bg-card border border-white/6 shrink-0"
        >
          <div
            className={`clock-arrow flex items-center justify-center shrink-0 w-9 h-9 rounded-[10px] text-[1.1rem] ${
              ev.action === "in"
                ? "bg-[rgba(34,197,94,0.1)] text-accent-green"
                : "bg-[rgba(239,68,68,0.1)] text-accent-red"
            }`}
          >
            <i className={`fa-solid ${ev.action === "in" ? "fa-arrow-right-to-bracket" : "fa-arrow-right-from-bracket"}`} />
          </div>
          <div className="info flex-1 min-w-0">
            <div className="top flex justify-between items-center">
              <span className="clock-team text-[0.9rem] font-bold text-[#f1f5f9]">{ev.team_name}</span>
              <span className="clock-time text-[0.9rem] font-extrabold text-white">{ev.time}</span>
            </div>
            <div className="clock-loc text-[0.75rem] text-text-muted font-semibold mt-0.5">{ev.location}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

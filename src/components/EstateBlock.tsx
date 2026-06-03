"use client";

import type { DayForecast } from "@/lib/types";
import DayCard from "./DayCard";

interface EstateBlockProps {
  name: string;
  days: DayForecast[];
}

export default function EstateBlock({ name, days }: EstateBlockProps) {
  return (
    <div className="estate-block flex-1 flex flex-col rounded-3xl bg-bg-panel p-[16px_16px_14px] min-w-0">
      <h3 className="estate-name text-[0.9rem] font-extrabold tracking-[0.5px] uppercase text-text-primary shrink-0 mb-3">
        {name}
      </h3>
      <div className="day-grid flex-1 grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
        {days.map((day, i) => (
          <DayCard key={i} day={day} />
        ))}
      </div>
    </div>
  );
}

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { EstateWeather, ClockEvent } from "@/lib/types";
import EstateBlock from "@/components/EstateBlock";
import ClockFeed from "@/components/ClockFeed";

const SLIDE_INTERVAL_MS = 30_000;      // 30s per slide
const WEATHER_REFRESH_MS = 30 * 60 * 1000; // 30 min weather refresh
const CLOCK_POLL_MS = 15_000;          // 15s clock polling (like D1 notification panel)

// API base URL: in dev mode (Next.js server), use relative URLs;
// in production (static export), use Electron HTTP server on port 8003
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function DashboardPage() {
  const [weatherData, setWeatherData] = useState<EstateWeather[]>([]);
  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // ── Track known clock event IDs for duplicate detection (like D1 notification panel) ──
  const knownClockIdsRef = useRef<Set<number>>(new Set());

  // ── Fetch weather ──
  const fetchWeather = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/weather`);
      const json = await res.json();
      if (json.success) {
        setWeatherData(json.data);
        setError(null);
      } else {
        setError(json.error || "Failed to load weather");
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    }
  }, []);

  // ── Fetch clock events — full replacement on every poll ──
  const fetchClock = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clock`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const all = json.data as ClockEvent[];
        knownClockIdsRef.current = new Set(all.filter(ev => ev.id != null).map(ev => ev.id!));
        setClockEvents(all);
      }
    } catch {
      // silent
    }
  }, []);

  // ── Initial fetch + intervals ──
  useEffect(() => {
    fetchWeather().finally(() => setLoading(false));
    fetchClock();   // full fetch on mount

    const weatherTimer = setInterval(fetchWeather, WEATHER_REFRESH_MS);
    const clockTimer = setInterval(fetchClock, CLOCK_POLL_MS);  // 15s polling (like D1)

    return () => {
      clearInterval(weatherTimer);
      clearInterval(clockTimer);
    };
  }, [fetchWeather, fetchClock]);

  // ── Slide timer ──
  useEffect(() => {
    if (weatherData.length === 0) return;
    const totalSlides = Math.ceil(weatherData.length / 2);
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % totalSlides);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [weatherData.length]);

  // ── Window controls (D1-style) ──
  const api = typeof window !== "undefined" ? window.electronAPI : undefined;

  const handleMinimize = () => { if (api) api.minimizeWindow(); };
  const handleMaximize = async () => {
    if (api) {
      await api.maximizeWindow();
      const max = await api.isMaximized();
      setIsMaximized(max);
    }
  };
  const handleClose = () => { if (api) api.closeWindow(); };
  const handleFullscreen = async () => {
    console.log("[D3] handleFullscreen called, isFullscreen currently:", isFullscreen, "api exists:", !!api);
    if (api) {
      const next = !isFullscreen;
      console.log("[D3] Calling setFullscreen(", next, ")");
      try {
        await api.setFullscreen(next);
        console.log("[D3] setFullscreen IPC completed successfully");
        // Optimistic update — toggle immediately so the UI responds right away
        setIsFullscreen(next);
      } catch (err) {
        console.error("[D3] setFullscreen IPC error:", err);
      }
    }
  };

  // ── Listen for fullscreen changes ──
  useEffect(() => {
    if (!api) return;
    // Check initial window state
    api.isMaximized().then(setIsMaximized);
    // Listen for fullscreen changes
    const cleanup = api.onFullscreenChanged(setIsFullscreen);
    return cleanup;
  }, [api]);

  // ── Compute visible estates ──
  const visibleEstates = weatherData.slice(slideIndex * 2, slideIndex * 2 + 2);
  const totalSlides = Math.max(1, Math.ceil(weatherData.length / 2));

  return (
    <main className="flex flex-col h-full bg-[#0d0d0d] text-white overflow-hidden select-none">

      {/* ───── DRAGGABLE HEADER BAR — hidden in fullscreen ───── */}
      {!isFullscreen && (
        <header
          className="flex items-center h-9 bg-[#1a1a1a] border-b border-white/5 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {/* Title with yellow dot */}
          <div className="flex items-center gap-2 px-4">
            <span className="w-2 h-2 rounded-full bg-[#FFB800]"></span>
            <span className="text-sm font-semibold text-[#f5f5f5] tracking-wide">Dashboard 3</span>
          </div>

          {/* Spacer */}
          <div className="flex-1"></div>

          {/* Window Controls (non-draggable) */}
          <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {/* Minimize */}
            <button
              onClick={handleMinimize}
              className="flex items-center justify-center w-11 h-full text-[#888888] hover:text-white hover:bg-white/10 transition-colors"
              title="Minimize"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
              </svg>
            </button>

            {/* Maximize / Restore (D1-style — toggles icon based on isMaximized) */}
            <button
              onClick={handleMaximize}
              className="flex items-center justify-center w-11 h-full text-[#888888] hover:text-white hover:bg-white/10 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="2" y="0.5" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
                  <rect x="0.5" y="2" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              )}
            </button>

            {/* Enter Fullscreen (D1-style corner-polyline icon) */}
            <button
              onClick={handleFullscreen}
              className="flex items-center justify-center w-11 h-full text-[#888888] hover:text-white hover:bg-white/10 transition-colors"
              title="Enter Fullscreen (F11)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16">
                <polyline points="2,6 2,2 6,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                <polyline points="10,2 14,2 14,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                <polyline points="14,10 14,14 10,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                <polyline points="6,14 2,14 2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                <line x1="2" y1="2" x2="6" y2="6" stroke="currentColor" strokeWidth="1.2" />
                <line x1="10" y1="6" x2="14" y2="2" stroke="currentColor" strokeWidth="1.2" />
                <line x1="14" y1="14" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
                <line x1="6" y1="10" x2="2" y2="14" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={handleClose}
              className="flex items-center justify-center w-11 h-full text-[#888888] hover:text-white hover:bg-red-500/80 transition-colors"
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2" />
                <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* ───── FULLSCREEN HOVER STRIP — thin overlay; hover to reveal exit ───── */}
      {isFullscreen && (
        <div
          className="fixed top-0 left-0 right-0 h-6 z-50 group cursor-default"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center justify-end h-8 bg-[#1a1a1a]/90 backdrop-blur-sm border-b border-white/5 px-2">
              <button
                onClick={handleFullscreen}
                className="flex items-center gap-1.5 px-3 h-full text-xs text-[#888888] hover:text-white transition-colors"
                title="Exit Fullscreen (F11)"
              >
                <svg width="12" height="12" viewBox="0 0 16 16">
                  <polyline points="2,6 2,2 6,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                  <polyline points="10,2 14,2 14,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                  <polyline points="14,10 14,14 10,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                  <polyline points="6,14 2,14 2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                  <line x1="6" y1="6" x2="2" y2="2" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="14" y1="2" x2="10" y2="6" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="2" y1="14" x2="6" y2="10" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>Exit Fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── CONTENT ───── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Main ─── */}
        <div className="dashboard-main flex-1 flex flex-col min-w-0">

          {/* Content header (matching Estate Clock In sidebar style) */}
          <div className="panel-header flex items-center justify-center border-b py-[14px] border-white/8 shrink-0">
            <h2 className="font-bold tracking-[2px] uppercase text-text-secondary">
              Estate Current &amp; Forecast Weather
            </h2>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
              Loading weather data...
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex-1 flex items-center justify-center text-accent-red text-sm">
              {error}
            </div>
          )}

          {/* Estate blocks */}
          {!loading && !error && (
            <div className="estates-row flex-1 flex gap-5 p-3.5 min-h-0">
              {visibleEstates.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[#64748b] text-sm">
                  No estate data available
                </div>
              ) : (
                visibleEstates.map((estate) => (
                  <EstateBlock key={estate.name} name={estate.name} days={estate.days} />
                ))
              )}
            </div>
          )}

          {/* Slide indicator */}
          {!loading && totalSlides > 1 && (
            <div className="slide-indicator flex items-center justify-center gap-1 pb-[14px] shrink-0 text-[0.7rem] font-bold tracking-[1.5px] uppercase text-[#64748b]">
              <div className="flex gap-1.5 mr-2">
                {Array.from({ length: totalSlides }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      i === slideIndex ? "bg-accent-blue" : "bg-[#475569]"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Sidebar ─── */}
        <aside className="dashboard-sidebar w-[320px] shrink-0 bg-[#1a1a1a] border-l border-white/8 flex flex-col min-h-0">
          <div className="panel-header flex items-center justify-center border-b py-[14px] border-white/8 shrink-0">
            <h2 className="font-bold tracking-[2px] uppercase text-text-secondary">
              Estate Clock In
            </h2>
          </div>
          <ClockFeed events={clockEvents} />
        </aside>
      </div>
    </main>
  );
}

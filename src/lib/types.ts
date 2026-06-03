// ── Estate ──
export interface Estate {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

// ── Weather ──
export interface HourlySlot {
  time: string;       // e.g. "6AM", "9AM", "12PM"
  temp: string;       // e.g. "26°"
  icon: string;       // Font Awesome icon class
  color: string;      // icon color hex
}

export interface DayForecast {
  label: string;      // "TODAY", "Tomorrow", "+2 Day", "+3 Day"
  cls: string;        // "today", "tomorrow", "plus2", "plus3"
  icon: string;       // main day icon
  icolor: string;     // main icon color
  temp: string;
  hourly: HourlySlot[];
  wind: string;       // km/h
  aqi: number;        // 1-5
}

export interface EstateWeather {
  name: string;
  days: DayForecast[];
}

// ── Clock Event ──
export interface ClockEvent {
  id?: number;
  team_name: string;
  location: string;
  time: string;
  action: "in" | "out";
  created_at?: string;
}

// ── API Responses ──
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Electron window controls (exposed via preload) ──
export interface ElectronAPI {
  platform: string;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  onFullscreenChanged: (callback: (value: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

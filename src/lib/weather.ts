import type { Estate, EstateWeather, DayForecast, HourlySlot, ClockEvent } from "./types";

// ── OpenWeatherMap helpers ──

const OWM_BASE = "https://api.openweathermap.org";
const OWM_KEY = process.env.OPENWEATHERMAP_API_KEY || "";

/** Map OWM icon code to Font Awesome icon + color */
function mapIcon(icon: string): { icon: string; color: string } {
  const code = icon.replace(/[dn]$/, ""); // strip day/night suffix
  const map: Record<string, { icon: string; color: string }> = {
    "01": { icon: "fa-sun", color: "#FBBF24" },
    "02": { icon: "fa-cloud-sun", color: "#FCD34D" },
    "03": { icon: "fa-cloud", color: "#9CA3AF" },
    "04": { icon: "fa-cloud", color: "#9CA3AF" },
    "09": { icon: "fa-cloud-showers-heavy", color: "#60A5FA" },
    "10": { icon: "fa-cloud-rain", color: "#93C5FD" },
    "11": { icon: "fa-bolt", color: "#FBBF24" },
    "13": { icon: "fa-snowflake", color: "#93C5FD" },
    "50": { icon: "fa-smog", color: "#9CA3AF" },
  };
  return map[code] || { icon: "fa-cloud", color: "#9CA3AF" };
}

/** Format a timestamp (epoch seconds) to a time label like "6AM" */
function formatHour(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

/** Label the day offset */
function dayLabel(offset: number): { label: string; cls: string } {
  if (offset === 0) return { label: "TODAY", cls: "today" };
  if (offset === 1) return { label: "Tomorrow", cls: "tomorrow" };
  return { label: `+${offset} Day`, cls: `plus${offset}` };
}

/** Compute AQI level from OWM AQI (1-5) */
function aqiData(val: number): { label: string; color: string } {
  const map: Record<number, { label: string; color: string }> = {
    1: { label: "Good", color: "#4ADE80" },
    2: { label: "Fair", color: "#FACC15" },
    3: { label: "Moderate", color: "#FB923C" },
    4: { label: "Poor", color: "#F87171" },
    5: { label: "V.Poor", color: "#FCA5A5" },
  };
  return map[val] || map[1];
}

// ── Fetch weather for an estate ──

export async function fetchEstateWeather(estate: Estate): Promise<EstateWeather> {
  // 1) Current weather
  const currentRes = await fetch(
    `${OWM_BASE}/data/2.5/weather?lat=${estate.lat}&lon=${estate.lon}&appid=${OWM_KEY}&units=metric`
  );
  if (!currentRes.ok) throw new Error(`Current weather API failed: ${currentRes.statusText}`);
  const currentData = await currentRes.json();

  // 2) 5-day / 3-hour forecast
  const forecastRes = await fetch(
    `${OWM_BASE}/data/2.5/forecast?lat=${estate.lat}&lon=${estate.lon}&appid=${OWM_KEY}&units=metric`
  );
  if (!forecastRes.ok) throw new Error(`Forecast API failed: ${forecastRes.statusText}`);
  const forecastData = await forecastRes.json();

  // 3) Air pollution
  const pollutionRes = await fetch(
    `${OWM_BASE}/data/2.5/air_pollution?lat=${estate.lat}&lon=${estate.lon}&appid=${OWM_KEY}`
  );
  const pollutionData = pollutionRes.ok ? await pollutionRes.json() : null;

  // ── Build 4-day forecast ──
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;

  const days: DayForecast[] = [];

  for (let offset = 0; offset < 4; offset++) {
    const dayStart = todayStart + offset * 86400;
    const dayEnd = dayStart + 86400;
    const { label, cls } = dayLabel(offset);

    // Filter forecast items for this day, starting from 6AM
    const dayItems = forecastData.list
      .filter((item: any) => {
        const t = item.dt;
        return t >= dayStart && t < dayEnd;
      })
      .sort((a: any, b: any) => a.dt - b.dt);

    // Pick 6 slots: 6AM, 9AM, 12PM, 3PM, 6PM, 9PM
    const targetHours = [6, 9, 12, 15, 18, 21];
    const hourly: HourlySlot[] = [];
    for (const h of targetHours) {
      const match = dayItems.find((item: any) => {
        const itemHour = new Date(item.dt * 1000).getHours();
        return itemHour === h;
      });
      if (match) {
        const mapped = mapIcon(match.weather[0].icon);
        hourly.push({
          time: formatHour(match.dt),
          temp: `${Math.round(match.main.temp)}°`,
          icon: mapped.icon,
          color: mapped.color,
        });
      }
    }

    // Main day info: use midday or first available
    const mainItem = dayItems.find((item: any) => {
      const h = new Date(item.dt * 1000).getHours();
      return h >= 11 && h <= 14;
    }) || dayItems[0];

    const mainMapped = mainItem
      ? mapIcon(mainItem.weather[0].icon)
      : { icon: "fa-cloud", color: "#9CA3AF" };

    const mainTemp = mainItem ? `${Math.round(mainItem.main.temp)}°` : "--°";

    // Wind: average across day items
    const avgWind = dayItems.length > 0
      ? Math.round(dayItems.reduce((sum: number, item: any) => sum + item.wind.speed, 0) / dayItems.length)
      : 0;

    // AQI: find the air pollution reading closest to this day
    let aqi = 1;
    if (pollutionData?.list?.length) {
      const closest = pollutionData.list.reduce((best: any, item: any) => {
        const diff = Math.abs(item.dt - dayStart);
        return diff < Math.abs(best.dt - dayStart) ? item : best;
      }, pollutionData.list[0]);
      aqi = closest.main.aqi;
    }

    days.push({
      label,
      cls,
      icon: mainMapped.icon,
      icolor: mainMapped.color,
      temp: mainTemp,
      hourly,
      wind: `${avgWind}`,
      aqi,
    });
  }

  return { name: estate.name, days };
}

// ── Cache weather data (in-memory) ──
let weatherCache: { data: EstateWeather[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getAllWeather(estates: Estate[]): Promise<EstateWeather[]> {
  if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_TTL_MS) {
    return weatherCache.data;
  }

  const results = await Promise.allSettled(estates.map(fetchEstateWeather));
  const data: EstateWeather[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") data.push(r.value);
  }

  weatherCache = { data, timestamp: Date.now() };
  return data;
}

export function invalidateWeatherCache(): void {
  weatherCache = null;
}

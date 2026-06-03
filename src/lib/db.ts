import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import * as fs from "fs";
import * as path from "path";

let db: SqlJsDatabase | null = null;
let dbPath: string | null = null;
let savePending = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ── File path ──

function getDbPath(): string {
  if (dbPath) return dbPath;

  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, "estate-weather-dashboard")
    : path.join(process.env.HOME || process.env.HOMEPATH || ".", ".config", "estate-weather-dashboard");

  dbPath = path.join(baseDir, "estate-weather.db");
  return dbPath;
}

// ── Persistence (same pattern as D1/D2) ──

export function saveDatabase(): void {
  if (!db || !dbPath) return;

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Debounced save — batches multiple writes within 500ms into a single disk write.
 * Call this after every mutation instead of saveDatabase() for better performance.
 */
export function saveDatabaseDebounced(): void {
  if (!db || !dbPath) return;

  if (saveTimer) clearTimeout(saveTimer);
  savePending = true;

  saveTimer = setTimeout(() => {
    saveDatabase();
    savePending = false;
    saveTimer = null;
  }, 500);
}

/** Flush any pending debounced save immediately */
export function flushSave(): void {
  if (savePending && saveTimer) {
    clearTimeout(saveTimer);
    saveDatabase();
    savePending = false;
    saveTimer = null;
  }
}

// ── Real estate data (41 plantation estates) ──

const ESTATE_SEED_DATA: [string, number, number][] = [
  ["Bikam 25",                     3.9620056,  101.3290405],
  ["Bikam 24",                     4.046247,   101.2973785],
  ["Kerdau Estate",                3.569969,   102.309967],
  ["Simpang ke West",              2.8921375,  101.3602899],
  ["Fleminton Estate",             3.9217222,  100.86725],
  ["SRE (Serkam Estate)",          2.1643643,  102.3938253],
  ["KSE25",                        2.180761,   102.437708],
  ["Padang Buluh Estate",          5.5737004,  100.5734647],
  ["BSEMD",                        5.4800436,  100.5974879],
  ["BSEV",                         5.5084779,  100.5722742],
  ["BPE (Bukit Pilah Estate)",     2.779722,   102.516927],
  ["BKE (Bikam Estate)",           4.0467722,  101.2990927],
  ["SWE",                          4.2399145,  100.7157132],
  ["Bagan Datuk Estate (BDE)",     3.9925034,  100.7902311],
  ["Simpang ke East Estate",       2.8799171,  101.3977056],
  ["South Estate AP Post",         2.8391946,  101.3607325],
  ["Kempas 24",                    2.1711644,  102.4337465],
  ["TLE",                          2.5181048,  101.9961319],
  ["KKE",                          4.466008,   101.0728682],
  ["TKE Ledang Div",               2.2863443,  102.5829773],
  ["SGE",                          4.3317859,  100.690451],
  ["SDE",                          5.337079,   100.741363],
  ["DDE",                          2.8035319,  101.4471886],
  ["First Entry Point East/West",  2.863122,   101.413244],
  ["Sengkang Estate",              2.438055,   102.0059128],
  ["CLE Main",                     3.8431898,  101.437811],
  ["CLE Trolak",                   3.8926179,  101.3768082],
  ["BHE Main",                     5.5563278,  100.7409439],
  ["BPE Kelpin",                   2.7792551,  102.5192857],
  ["CHERSONESE",                   4.9922752,  100.4370651],
  ["BSEKK",                        5.5341,     100.666435],
  ["BJH",                          4.924998,   101.1037338],
  ["PBE Gate 2",                   5.8021317,  100.485355],
  ["JTE Sg Pedu",                  5.8110641,  100.5578043],
  ["JTE Main",                     5.7656527,  100.6321716],
  ["KME Main",                     4.826392,   101.0623367],
  ["KME Changkat Salak",           4.8531794,  101.0038462],
  ["KKS ELPHIL",                   4.8897663,  101.0942797],
  ["EPE KAMIRI",                   4.8254962,  101.0836334],
];

// ── DB Init ──

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const SQL = await initSqlJs();
  const filePath = getDbPath();

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing DB from disk or create new
  let data: Buffer | null = null;
  if (fs.existsSync(filePath)) {
    data = fs.readFileSync(filePath);
  }

  db = new SQL.Database(data);

  // Enable WAL mode
  db.run("PRAGMA journal_mode=WAL");

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS estates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT NOT NULL,
      location TEXT NOT NULL,
      time TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('in', 'out')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Seed real estates if empty
  const count = db.exec("SELECT COUNT(*) as c FROM estates");
  if (count[0]?.values[0][0] === 0) {
    const seed = db.prepare("INSERT OR IGNORE INTO estates (name, lat, lon) VALUES (?, ?, ?)");
    for (const [name, lat, lon] of ESTATE_SEED_DATA) {
      seed.bind([name, lat, lon]);
      seed.step();
      seed.reset();
    }
    seed.free();
  }

  // Persist immediately after init (creates file on first run)
  saveDatabase();

  return db;
}

export function closeDb(): void {
  if (db) {
    flushSave();
    db.close();
    db = null;
  }
}

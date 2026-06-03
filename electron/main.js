const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const initSqlJs = require('sql.js');

let mainWindow;
let db;
let dbPath;

// Check if running in dev mode (passed via command line)
const isDevMode = process.argv.includes('--dev');

// Custom port for dev server
const devPort = (() => {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return parseInt(process.argv[idx + 1], 10);
}
  return 3002;
})();

// Load .env file for API keys — must run AFTER isDevMode is defined
// Dev mode: loads from project root (.env)
// Production: loads from same folder as the .exe (user copies .env next to exe after extraction)
if (isDevMode) {
  const devEnvPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(devEnvPath)) {
    require('dotenv').config({ path: devEnvPath });
  }
} else {
  const exeDir = path.dirname(app.getPath('exe'));
  const prodEnvPath = path.join(exeDir, '.env');
  if (fs.existsSync(prodEnvPath)) {
    require('dotenv').config({ path: prodEnvPath });
    console.log('[main] Loaded .env from exe directory:', prodEnvPath);
  } else {
    // Fallback: try system env vars or CWD
    require('dotenv').config();
  }
}

const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 8003;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,           // D1-style: remove OS chrome (menu bar, title bar, borders)
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev mode, load from localhost; otherwise load static files
  if (isDevMode) {
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools(); // Attached to window (D1-style)

    // Suppress harmless DevTools Autofill warnings
    mainWindow.webContents.on('console-message', (event, level, message) => {
      if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
        event.preventDefault();
}
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
}

  // Maximize on creation (full window by default)
  mainWindow.maximize();

  // Notify renderer on fullscreen changes (F11, etc.)
  mainWindow.on('enter-fullscreen', () => {
    mainWindow.webContents.send('window:fullscreenChanged', true);
  });
  mainWindow.on('leave-fullscreen', () => {
    mainWindow.webContents.send('window:fullscreenChanged', false);
  });

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cdn = 'https://cdnjs.cloudflare.com';
    const cspSources = [
      "default-src 'self'",
      `script-src 'self'${isDevMode ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
      `style-src 'self' 'unsafe-inline' ${cdn}`,
      "img-src 'self' data:",
      `font-src 'self' data: ${cdn}`,
       `connect-src 'self' http://localhost:8003 ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*${isDevMode ? ' http://localhost:* http://127.0.0.1:*' : ''}`,
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspSources],
      },
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ──────────────────────────────────────────────
//  Database (sql.js) — same pattern as D1/D2
// ──────────────────────────────────────────────

async function initDatabase() {
  const SQL = await initSqlJs({
    // In development, WASM is in node_modules; in production, it's in extraResources
    locateFile: (file) => app.isPackaged
      ? path.join(process.resourcesPath, file)
      : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });
  dbPath = path.join(app.getPath('userData'), 'estate-weather.db');

  // Load existing database or create new one
  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
}

  db = new SQL.Database(data);

  // Enable WAL mode
  db.run('PRAGMA journal_mode=WAL');

  // Estates table
  db.run(`
    CREATE TABLE IF NOT EXISTS estates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    )
  `);

  // Clock events table
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

  // Seed 41 plantation estates if empty
  const count = db.exec("SELECT COUNT(*) as c FROM estates");
  if (count[0]?.values[0][0] === 0) {
    const estates = [
      ['Bikam 25', 3.9620056, 101.3290405],
      ['Bikam 24', 4.046247, 101.2973785],
      ['Kerdau Estate', 3.569969, 102.309967],
      ['Simpang ke West', 2.8921375, 101.3602899],
      ['Fleminton Estate', 3.9217222, 100.86725],
      ['SRE (Serkam Estate)', 2.1643643, 102.3938253],
      ['KSE25', 2.180761, 102.437708],
      ['Padang Buluh Estate', 5.5737004, 100.5734647],
      ['BSEMD', 5.4800436, 100.5974879],
      ['BSEV', 5.5084779, 100.5722742],
      ['BPE (Bukit Pilah Estate)', 2.779722, 102.516927],
      ['BKE (Bikam Estate)', 4.0467722, 101.2990927],
      ['SWE', 4.2399145, 100.7157132],
      ['Bagan Datuk Estate (BDE)', 3.9925034, 100.7902311],
      ['Simpang ke East Estate', 2.8799171, 101.3977056],
      ['South Estate AP Post', 2.8391946, 101.3607325],
      ['Kempas 24', 2.1711644, 102.4337465],
      ['TLE', 2.5181048, 101.9961319],
      ['KKE', 4.466008, 101.0728682],
      ['TKE Ledang Div', 2.2863443, 102.5829773],
      ['SGE', 4.3317859, 100.690451],
      ['SDE', 5.337079, 100.741363],
      ['DDE', 2.8035319, 101.4471886],
      ['First Entry Point East/West', 2.863122, 101.413244],
      ['Sengkang Estate', 2.438055, 102.0059128],
      ['CLE Main', 3.8431898, 101.437811],
      ['CLE Trolak', 3.8926179, 101.3768082],
      ['BHE Main', 5.5563278, 100.7409439],
      ['BPE Kelpin', 2.7792551, 102.5192857],
      ['CHERSONESE', 4.9922752, 100.4370651],
      ['BSEKK', 5.5341, 100.666435],
      ['BJH', 4.924998, 101.1037338],
      ['PBE Gate 2', 5.8021317, 100.485355],
      ['JTE Sg Pedu', 5.8110641, 100.5578043],
      ['JTE Main', 5.7656527, 100.6321716],
      ['KME Main', 4.826392, 101.0623367],
      ['KME Changkat Salak', 4.8531794, 101.0038462],
      ['KKS ELPHIL', 4.8897663, 101.0942797],
      ['EPE KAMIRI', 4.8254962, 101.0836334],
    ];

    const seed = db.prepare('INSERT OR IGNORE INTO estates (name, lat, lon) VALUES (?, ?, ?)');
    for (const [name, lat, lon] of estates) {
      seed.bind([name, lat, lon]);
      seed.step();
      seed.reset();
}
    seed.free();
}

  saveDatabase();
  console.log('Database initialized at:', dbPath);
}

function saveDatabase() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}
}

// ──────────────────────────────────────────────
//  HTTP Server (port 8003) — external data push
// ──────────────────────────────────────────────

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let totalBytes = 0;
    const MAX_BODY_BYTES = 1024 * 16; // 16 KB

    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
}
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        reject(new Error('Empty body'));
        return;
}
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
}
    });

    req.on('error', (err) => reject(err));
  });
}

// GET /api/clock — return today's clock events
function handleGetClock(res) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stmt = db.prepare(`
      SELECT id, team_name, location, time, action, created_at
      FROM clock_events
      WHERE date(created_at) = ?
      ORDER BY created_at DESC
      LIMIT 50
    `);
    stmt.bind([today]);
    const events = [];
    while (stmt.step()) {
      events.push(stmt.getAsObject());
    }
    stmt.free();

    jsonResponse(res, 200, { success: true, data: events });
  } catch (err) {
    console.error('Clock GET error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to fetch clock events' });
  }
}

// POST /api/clock — create a new clock-in/out event
async function handlePostClock(req, res) {
  let parsed;
  try {
    parsed = await parseRequestBody(req);
  } catch (err) {
    if (err.message === 'Payload too large') {
      jsonResponse(res, 413, { error: 'Request body too large' });
      return;
}
    const msg = err.message === 'Invalid JSON' ? 'Invalid JSON in request body' : 'Empty request body';
    jsonResponse(res, 400, { error: msg });
    return;
}

  const { team_name, location, time, action } = parsed;

  if (!team_name || !location || !time || !action) {
    jsonResponse(res, 400, {
      success: false,
      error: 'Missing required fields: team_name, location, time, action',
    });
    return;
}

  if (!['in', 'out'].includes(action)) {
    jsonResponse(res, 400, {
      success: false,
      error: "Action must be 'in' or 'out'",
    });
    return;
}

  try {
    // Insert the new event & get its ID in one step
    const insertStmt = db.prepare(`
      INSERT INTO clock_events (team_name, location, time, action)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `);
    insertStmt.bind([team_name, location, time, action]);
    let insertedId = null;
    if (insertStmt.step()) {
      insertedId = insertStmt.getAsObject().id;
    }
    insertStmt.free();

    // If clocking out, auto-delete the matching clock-in for the same team + location
    let deletedInId = null;
    if (action === 'out') {
      const stmt = db.prepare(`
        SELECT id FROM clock_events
        WHERE team_name = ? AND location = ? AND action = 'in'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);
      stmt.bind([team_name, location]);
      if (stmt.step()) {
        deletedInId = stmt.getAsObject().id;
        db.run('DELETE FROM clock_events WHERE id = ?', [deletedInId]);
      }
      stmt.free();
    }

    saveDatabase();

    jsonResponse(res, 200, {
      success: true,
      id: insertedId,
      data: { team_name, location, time, action },
      ...(deletedInId && { deleted_clock_in_id: deletedInId }),
    });

    let logMsg = `Clock ${action}: ${team_name} @ ${location} at ${time} (id=${insertedId})`;
    if (deletedInId) logMsg += ` (removed clock-in id=${deletedInId})`;
    console.log(logMsg);
  } catch (err) {
    console.error('Clock POST error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to create clock event' });
  }
}

// DELETE /api/clock — delete records older than given date
function handleDeleteClock(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const before = url.searchParams.get('before') || new Date().toISOString().slice(0, 10);

    db.run('DELETE FROM clock_events WHERE date(created_at) < ?', [before]);
    const affected = db.getRowsModified();
    saveDatabase();

    if (affected === 0) {
      jsonResponse(res, 404, { success: false, error: `No records older than ${before} found` });
      return;
    }

    jsonResponse(res, 200, { success: true, message: `Deleted ${affected} records older than ${before}` });
  } catch (err) {
    console.error('Clock DELETE (bulk) error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to delete old records' });
  }
}

// DELETE /api/clock/:id — delete a specific clock event
function handleDeleteClockById(id, res) {
  try {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      jsonResponse(res, 400, { success: false, error: 'Invalid ID. Must be a number.' });
      return;
    }

    db.run('DELETE FROM clock_events WHERE id = ?', [parsedId]);
    const affected = db.getRowsModified();
    saveDatabase();

    if (affected === 0) {
      jsonResponse(res, 404, { success: false, error: `Clock event with id ${parsedId} not found` });
      return;
    }

    jsonResponse(res, 200, { success: true, message: `Deleted clock event with id ${parsedId}` });
  } catch (err) {
    console.error('Clock DELETE (id) error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to delete clock event' });
  }
}

// ── Estate Management API ──

// GET /api/estates — list all estates
function handleGetEstates(res) {
  try {
    const results = db.exec('SELECT rowid as id, name, lat, lon FROM estates ORDER BY name');
    const estates = [];
    if (results[0]) {
      const columns = results[0].columns;
      for (const row of results[0].values) {
        const obj = {};
        columns.forEach((col, i) => obj[col] = row[i]);
        estates.push(obj);
      }
    }
    const response = { success: true, data: estates };
    if (estates.length === 0) {
      response.message = 'No estates found. Add one via POST /api/estates.';
    }
    jsonResponse(res, 200, response);
  } catch (err) {
    console.error('Estates GET error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to fetch estates' });
  }
}

// POST /api/estates — add estate(s). Accepts a single object or an array.
async function handlePostEstate(req, res) {
  let parsed;
  try {
    parsed = await parseRequestBody(req);
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  // ── Batch insert (array of estates) ──
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      jsonResponse(res, 400, { success: false, error: 'Array is empty' });
      return;
    }

    // Pre-validate all items before starting the transaction
    for (const item of parsed) {
      const { name, lat, lon } = item;
      if (!name || lat == null || lon == null) {
        jsonResponse(res, 400, { success: false, error: `Missing fields in item: ${JSON.stringify(item)}` });
        return;
      }
      if (isNaN(Number(lat)) || isNaN(Number(lon))) {
        jsonResponse(res, 400, { success: false, error: `lat/lon must be numbers in: ${name}` });
        return;
      }
    }

    try {
      db.run('BEGIN TRANSACTION');
      const insertStmt = db.prepare('INSERT INTO estates (name, lat, lon) VALUES (?, ?, ?) RETURNING id');
      const inserted = [];
      for (const item of parsed) {
        const { name, lat, lon } = item;
        insertStmt.bind([name, Number(lat), Number(lon)]);
        let id = null;
        if (insertStmt.step()) {
          id = insertStmt.getAsObject().id;
        }
        insertStmt.reset();
        inserted.push({ id, name, lat: Number(lat), lon: Number(lon) });
      }
      insertStmt.free();
      db.run('COMMIT');
      saveDatabase();
      invalidateWeatherCache();
      jsonResponse(res, 200, { success: true, count: inserted.length, data: inserted });
      console.log(`Estates batch inserted: ${inserted.length} estates`);
    } catch (err) {
      db.run('ROLLBACK');
      console.error('Estates batch POST error:', err);
      jsonResponse(res, 500, { success: false, error: 'Failed to batch create estates' });
    }
    return;
  }

  // ── Single insert ──
  const { name, lat, lon } = parsed;

  if (!name || lat == null || lon == null) {
    jsonResponse(res, 400, { success: false, error: 'Missing required fields: name, lat, lon' });
    return;
  }

  if (isNaN(Number(lat)) || isNaN(Number(lon))) {
    jsonResponse(res, 400, { success: false, error: 'lat and lon must be numbers' });
    return;
  }

  try {
    const insertStmt = db.prepare('INSERT INTO estates (name, lat, lon) VALUES (?, ?, ?) RETURNING id');
    insertStmt.bind([name, Number(lat), Number(lon)]);
    let insertedId = null;
    if (insertStmt.step()) {
      insertedId = insertStmt.getAsObject().id;
    }
    insertStmt.free();
    saveDatabase();
    invalidateWeatherCache();

    jsonResponse(res, 200, {
      success: true,
      id: insertedId,
      data: { name, lat: Number(lat), lon: Number(lon) },
    });
    console.log(`Estate added: ${name} (${lat}, ${lon}) [id=${insertedId}]`);
  } catch (err) {
    console.error('Estates POST error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to create estate' });
  }
}

// DELETE /api/estates — delete all estates
function handleDeleteAllEstates(res) {
  try {
    db.run('DELETE FROM estates');
    const affected = db.getRowsModified();
    saveDatabase();
    invalidateWeatherCache();

    jsonResponse(res, 200, { success: true, message: `Deleted all ${affected} estates` });
    console.log(`All estates deleted: ${affected} removed`);
  } catch (err) {
    console.error('Estates DELETE ALL error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to delete all estates' });
  }
}

// GET /api/estates/:id — get a single estate by ID
function handleGetEstateById(id, res) {
  try {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      jsonResponse(res, 400, { success: false, error: 'Invalid ID. Must be a number.' });
      return;
    }

    const stmt = db.prepare('SELECT rowid as id, name, lat, lon FROM estates WHERE rowid = ?');
    stmt.bind([parsedId]);
    if (stmt.step()) {
      const estate = stmt.getAsObject();
      stmt.free();
      jsonResponse(res, 200, { success: true, data: estate });
      return;
    }
    stmt.free();
    jsonResponse(res, 404, { success: false, error: `Estate with id ${parsedId} not found` });
  } catch (err) {
    console.error('Estates GET by ID error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to fetch estate' });
  }
}

// DELETE /api/estates/:id — delete an estate by ID
function handleDeleteEstateById(id, res) {
  try {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      jsonResponse(res, 400, { success: false, error: 'Invalid ID. Must be a number.' });
      return;
    }

    db.run('DELETE FROM estates WHERE rowid = ?', [parsedId]);
    const affected = db.getRowsModified();
    saveDatabase();

    if (affected === 0) {
      jsonResponse(res, 404, { success: false, error: `Estate with id ${parsedId} not found` });
      return;
    }

    invalidateWeatherCache();
    jsonResponse(res, 200, { success: true, message: `Deleted estate with id ${parsedId}` });
    console.log(`Estate deleted: id=${parsedId}`);
  } catch (err) {
    console.error('Estates DELETE error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to delete estate' });
  }
}

// ── Weather helpers (OpenWeatherMap) ──

const OWM_BASE = 'https://api.openweathermap.org';

// Target UTC hours for hourly forecast display (6 slots, ~3h apart starting from early morning).
// OWM returns data at 0, 3, 6, 9, 12, 15, 18, 21 UTC.
// For Malaysia (UTC+8): 21→5AM, 0→8AM, 3→11AM, 6→2PM, 9→5PM, 12→8PM
// (closest available to a 6AM-9PM local cycle)
const HOURLY_TARGET_UTC_HOURS = [21, 0, 3, 6, 9, 12];

function getOwmKey() {
  return process.env.OPENWEATHERMAP_API_KEY || '';
}

/** Map OWM icon code to Font Awesome icon + color */
function mapWeatherIcon(icon) {
  const code = icon.replace(/[dn]$/, '');
  const map = {
    '01': { icon: 'fa-sun', color: '#FBBF24' },
    '02': { icon: 'fa-cloud-sun', color: '#FCD34D' },
    '03': { icon: 'fa-cloud', color: '#9CA3AF' },
    '04': { icon: 'fa-cloud', color: '#9CA3AF' },
    '09': { icon: 'fa-cloud-showers-heavy', color: '#60A5FA' },
    '10': { icon: 'fa-cloud-rain', color: '#93C5FD' },
    '11': { icon: 'fa-bolt', color: '#FBBF24' },
    '13': { icon: 'fa-snowflake', color: '#93C5FD' },
    '50': { icon: 'fa-smog', color: '#9CA3AF' },
  };
  return map[code] || { icon: 'fa-cloud', color: '#9CA3AF' };
}

function formatHour(ts) {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

function dayLabel(offset) {
  if (offset === 0) return { label: 'TODAY', cls: 'today' };
  if (offset === 1) return { label: 'Tomorrow', cls: 'tomorrow' };
  return { label: `+${offset} Day`, cls: `plus${offset}` };
}

/** Fetch weather data for a single estate */
async function fetchEstateWeather(estate) {
  const key = getOwmKey();
  if (!key) return null;

  // 1) 5-day / 3-hour forecast
  const forecastRes = await fetch(
    `${OWM_BASE}/data/2.5/forecast?lat=${estate.lat}&lon=${estate.lon}&appid=${key}&units=metric`
  );
  if (!forecastRes.ok) throw new Error(`Forecast API failed: ${forecastRes.statusText}`);
  const forecastData = await forecastRes.json();

  // 2) Air pollution
  let pollutionData = null;
  try {
    const pollRes = await fetch(
      `${OWM_BASE}/data/2.5/air_pollution?lat=${estate.lat}&lon=${estate.lon}&appid=${key}`
    );
    if (pollRes.ok) pollutionData = await pollRes.json();
  } catch { /* ignore pollution errors */ }

  // ── Build 4-day forecast ──
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const days = [];

  for (let offset = 0; offset < 4; offset++) {
    const dayStart = todayStart + offset * 86400;
    const dayEnd = dayStart + 86400;
    const { label, cls } = dayLabel(offset);

    const dayItems = (forecastData.list || [])
      .filter(item => item.dt >= dayStart && item.dt < dayEnd)
      .sort((a, b) => a.dt - b.dt);

    // Pick up to 6 hourly slots: exact UTC hour matches first,
    // then fill remaining slots with other available forecast items.
    const hourly = [];
    const usedIndices = new Set();

    // Pass 1: exact UTC hour matches
    for (const h of HOURLY_TARGET_UTC_HOURS) {
      const idx = dayItems.findIndex((item, i) =>
        !usedIndices.has(i) && new Date(item.dt * 1000).getUTCHours() === h
      );
      if (idx !== -1) {
        usedIndices.add(idx);
        const item = dayItems[idx];
        const mapped = mapWeatherIcon(item.weather[0].icon);
        hourly.push({
          time: formatHour(item.dt),
          temp: `${Math.round(item.main.temp)}°`,
          icon: mapped.icon,
          color: mapped.color,
        });
      }
    }

    // Pass 2: fill remaining slots with other unused items
    if (hourly.length < 6) {
      for (let i = 0; i < dayItems.length && hourly.length < 6; i++) {
        if (!usedIndices.has(i)) {
          usedIndices.add(i);
          const item = dayItems[i];
          const mapped = mapWeatherIcon(item.weather[0].icon);
          hourly.push({
            time: formatHour(item.dt),
            temp: `${Math.round(item.main.temp)}°`,
            icon: mapped.icon,
            color: mapped.color,
          });
        }
      }
    }

    // Main day info: pick midday-ish forecast using UTC hours (consistent with hourly matching).
    // UTC 3-6 corresponds to ~11AM-2PM in most Asian timezones (UTC+8 → 11AM-2PM MYT).
    const mainItem = dayItems.find(item => {
      const h = new Date(item.dt * 1000).getUTCHours();
      return h >= 3 && h <= 6;
    }) || dayItems[0];

    const mainMapped = mainItem
      ? mapWeatherIcon(mainItem.weather[0].icon)
      : { icon: 'fa-cloud', color: '#9CA3AF' };

    const mainTemp = mainItem ? `${Math.round(mainItem.main.temp)}°` : '--°';

    // Wind: average across day items
    const avgWind = dayItems.length > 0
      ? Math.round(dayItems.reduce((sum, item) => sum + item.wind.speed, 0) / dayItems.length)
      : 0;

    // AQI: find the air pollution reading closest to this day
    let aqi = 1;
    if (pollutionData?.list?.length) {
      const closest = pollutionData.list.reduce((best, item) => {
        const diff = Math.abs(item.dt - dayStart);
        return diff < Math.abs(best.dt - dayStart) ? item : best;
      });
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

// ── Weather cache (30 min TTL) ──
let weatherCache = null;
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

function invalidateWeatherCache() {
  weatherCache = null;
}

/** GET /api/weather — fetch weather for all estates */
async function handleGetWeather(res) {
  const key = getOwmKey();
  if (!key) {
    jsonResponse(res, 200, { success: true, data: [], message: 'OpenWeatherMap API key not set. Set OPENWEATHERMAP_API_KEY environment variable.' });
    return;
  }

  // Return cached data if fresh
  if (weatherCache && Date.now() - weatherCache.timestamp < WEATHER_CACHE_TTL) {
    jsonResponse(res, 200, { success: true, data: weatherCache.data });
    return;
  }

  try {
    // Get estates from DB
    const results = db.exec('SELECT name, lat, lon FROM estates');
    const estates = [];
    if (results[0]) {
      for (const row of results[0].values) {
        estates.push({ name: row[0], lat: row[1], lon: row[2] });
      }
    }

    if (estates.length === 0) {
      jsonResponse(res, 200, { success: true, data: [], message: 'No estates found. Add one via POST /api/estates.' });
      return;
    }

    // Fetch weather for all estates in parallel (with concurrency limit)
    const concurrency = 5;
    const data = [];
    for (let i = 0; i < estates.length; i += concurrency) {
      const batch = estates.slice(i, i + concurrency);
      const weatherResults = await Promise.allSettled(batch.map(fetchEstateWeather));
      for (const r of weatherResults) {
        if (r.status === 'fulfilled' && r.value) data.push(r.value);
      }
    }

    weatherCache = { data, timestamp: Date.now() };
    jsonResponse(res, 200, { success: true, data });
  } catch (err) {
    console.error('Weather GET error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to fetch weather data' });
  }
}

// GET /api/weather/:id — fetch weather for a single estate by ID
async function handleGetWeatherById(id, res) {
  const key = getOwmKey();
  if (!key) {
    jsonResponse(res, 200, { success: true, data: null, message: 'OpenWeatherMap API key not set. Set OPENWEATHERMAP_API_KEY environment variable.' });
    return;
  }

  try {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      jsonResponse(res, 400, { success: false, error: 'Invalid ID. Must be a number.' });
      return;
    }

    const stmt = db.prepare('SELECT name, lat, lon FROM estates WHERE rowid = ?');
    stmt.bind([parsedId]);
    if (!stmt.step()) {
      stmt.free();
      jsonResponse(res, 404, { success: false, error: `Estate with id ${parsedId} not found` });
      return;
    }
    const estate = stmt.getAsObject();
    stmt.free();

    const weather = await fetchEstateWeather(estate);
    if (!weather) {
      jsonResponse(res, 500, { success: false, error: 'Failed to fetch weather data' });
      return;
    }

    jsonResponse(res, 200, { success: true, data: weather });
  } catch (err) {
    console.error('Weather GET by ID error:', err);
    jsonResponse(res, 500, { success: false, error: 'Failed to fetch weather data' });
  }
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers for external pushes (AI Assistant, Telegram bot, Postman)
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
}

    const url = req.url.split('?')[0];

    if (url.startsWith('/api/clock')) {
      const parts = url.split('/');
      const id = parts[3]; // /api/clock/:id -> parts[0]='', parts[1]='api', parts[2]='clock', parts[3]=id

      if (id) {
        if (req.method === 'DELETE') {
          handleDeleteClockById(id, res);
          return;
        } else {
          jsonResponse(res, 405, { error: 'Method not allowed for specific ID. Use DELETE.' });
          return;
}
}

      switch (req.method) {
        case 'GET':
          handleGetClock(res);
          return;
        case 'POST':
          handlePostClock(req, res);
          return;
        case 'DELETE':
          handleDeleteClock(req, res);
          return;
        default:
          jsonResponse(res, 405, { error: 'Method not allowed. Use GET, POST, or DELETE.' });
          return;
}
}

    // ── Estate management API ──
    if (url.startsWith('/api/estates')) {
      const parts = url.split('/');
      const id = parts[3];

      if (id) {
        if (req.method === 'DELETE') {
          handleDeleteEstateById(id, res);
          return;
        }
        if (req.method === 'GET') {
          handleGetEstateById(id, res);
          return;
        }
        jsonResponse(res, 405, { error: 'Method not allowed for specific ID. Use GET or DELETE.' });
        return;
      }

      switch (req.method) {
        case 'GET':
          handleGetEstates(res);
          return;
        case 'POST':
          await handlePostEstate(req, res);
          return;
        case 'DELETE':
          handleDeleteAllEstates(res);
          return;
        default:
          jsonResponse(res, 405, { error: 'Method not allowed. Use GET, POST, or DELETE.' });
          return;
      }
    }

    // GET /api/weather — fetch weather for all estates (or one by ID)
    if (url.startsWith('/api/weather')) {
      if (req.method !== 'GET') {
        jsonResponse(res, 405, { error: 'Method not allowed. Use GET.' });
        return;
      }
      const weatherParts = url.split('/');
      const weatherId = weatherParts[3];
      if (weatherId) {
        await handleGetWeatherById(weatherId, res);
        return;
      }
      await handleGetWeather(res);
      return;
    }

    // Health check
    if (url === '/api/health') {
      jsonResponse(res, 200, { status: 'ok', port: HTTP_PORT });
      return;
}

    // 404 for unknown routes
    jsonResponse(res, 404, { error: 'Not found' });
  });

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[Estate Weather] HTTP Server running on http://0.0.0.0:${HTTP_PORT}`);
    console.log(`[Estate Weather] POST clock data to: http://YOUR_IP:${HTTP_PORT}/api/clock`);
    console.log(`[Estate Weather] GET clock data from: http://YOUR_IP:${HTTP_PORT}/api/clock`);
  });

  server.on('error', (err) => {
    console.error('HTTP Server error:', err);
  });
}

// ──────────────────────────────────────────────
//  App Lifecycle
// ──────────────────────────────────────────────

app.whenReady().then(async () => {
  // ── IPC handlers (D1-style window controls) ──
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
}
}
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('window:setFullscreen', async (_, fullscreen) => {
    try {
      console.log('[main] setFullscreen:', fullscreen);
      if (mainWindow) {
        mainWindow.setFullScreen(fullscreen);
        console.log('[main] setFullscreen completed, now fullscreen?:', mainWindow.isFullScreen());
      } else {
        console.log('[main] mainWindow not available');
}
    } catch (err) {
      console.error('[main] setFullscreen error:', err);
}
  });

  await initDatabase();
  startHttpServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
}
  });
});

app.on('window-all-closed', () => {
  saveDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
}
});

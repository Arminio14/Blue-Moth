const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { randomUUID } = crypto;

// Eigenes Protokoll: liefert den Player und die ROM-Dateien (nur per geheimem Einmal-Token).
protocol.registerSchemesAsPrivileged([{ scheme: 'bluemoth', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const U = () => app.getPath('userData');
const ACCOUNTS_FILE = () => path.join(U(), 'accounts.json');
const GOOGLE_FILE = () => path.join(U(), 'google.json');
const ROM_EXT = ['rom','bin','iso','img','cue','chd','nes','sfc','smc','gba','gbc','gb','nds','3ds','cia','n64','z64','v64','md','gen','smd','gg','sms','pce','cso','pbp','zip','7z'];
const SYSTEM_BY_EXT = { nes:'nes', sfc:'snes', smc:'snes', gb:'gb', gbc:'gb', gba:'gba', md:'segaMD', gen:'segaMD', smd:'segaMD', gg:'segaGG', sms:'segaMS', pce:'pce', n64:'n64', z64:'n64', v64:'n64', nds:'nds', cue:'psx', pbp:'psx', chd:'psx' };
const SYSTEM_IDS = new Set(['nes','snes','gb','gba','segaMD','segaMS','segaGG','pce','n64','nds','psx']);

let current = null; // angemeldeter Benutzer { id, username }
const ROM_TOKENS = new Map();

/* ---------- Hilfsfunktionen ---------- */
async function readJson(file, fallback) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; } }
async function writeJson(file, data) { await fsp.mkdir(path.dirname(file), { recursive: true }); await fsp.writeFile(file, JSON.stringify(data, null, 2)); }
const need = () => { if (!current) throw new Error('Bitte zuerst anmelden.'); };
const DB_FILE = () => { need(); return path.join(U(), 'users', current.id, 'library.json'); };
const FILES_DIR = () => { need(); return path.join(U(), 'users', current.id, 'files'); };
const readDb = () => readJson(DB_FILE(), []);
const writeDb = items => writeJson(DB_FILE(), items);
const readAccounts = () => readJson(ACCOUNTS_FILE(), []);
const writeAccounts = a => writeJson(ACCOUNTS_FILE(), a);
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => e ? rej(e) : res(k)));
const b64u = buf => Buffer.from(buf).toString('base64url');
const pub = a => ({ id: a.id, username: a.username, display: a.display || a.username, googleEmail: a.googleEmail || null, hasPassword: !!a.hash });
function startSession(acc) { current = { id: acc.id, username: acc.username }; return pub(acc); }


// Creator-Zugang: nur wer die geheime Datei creator.key besitzt, kommt ohne Anmeldung hinein.
// Hier steht nur der SHA-256-Hash des Schlüssels, nicht der Schlüssel selbst.
const CREATOR_KEY_HASH = '073ac3b3c79c1d056284216f01ea4dd38dd1817e39e7f279bd3186420b8faf74';
const CREATOR_ID = 'creator-account';
async function findCreatorKey() {
  const dirs = [U(), process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath), app.getPath('desktop'), app.getPath('downloads'), app.getPath('documents')].filter(Boolean);
  for (const d of dirs) { const f = path.join(d, 'creator.key'); if (fs.existsSync(f)) return f; }
  return null;
}
function keyIsValid(text) {
  const tok = String(text || '').trim().split(/\s+/).pop() || '';
  const h = crypto.createHash('sha256').update(tok).digest();
  return crypto.timingSafeEqual(h, Buffer.from(CREATOR_KEY_HASH, 'hex'));
}

// Standard-Konto beim allerersten Start, damit man sofort hineinkommt.
const DEFAULT_USER = 'mothy', DEFAULT_PASS = 'blue777';
async function seedDefaultAccount() {
  const accts = await readAccounts();
  if (accts.length) return;
  const salt = crypto.randomBytes(16); const hash = await scrypt(DEFAULT_PASS, salt);
  accts.push({ id: randomUUID(), username: DEFAULT_USER, salt: salt.toString('hex'), hash: hash.toString('hex'), createdAt: Date.now() });
  await writeAccounts(accts);
}

/* ---------- Fenster ---------- */
function createWindow() {
  const win = new BrowserWindow({ width: 1180, height: 800, minWidth: 760, minHeight: 560, title: 'Blue Moth', icon: path.join(__dirname, 'assets/moth_icon.png'), backgroundColor: '#071334', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile('index.html');
}
app.whenReady().then(async () => {
  protocol.handle('bluemoth', async req => {
    const u = new URL(req.url);
    if (u.host === 'app') {
      const f = path.basename(decodeURIComponent(u.pathname));
      if (!['player.html', 'player.js'].includes(f)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(path.join(__dirname, f)).toString());
    }
    if (u.host === 'rom') {
      const p = ROM_TOKENS.get(u.pathname.split('/').filter(Boolean)[0]);
      if (!p || !fs.existsSync(p)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(p).toString());
    }
    return new Response('Not found', { status: 404 });
  });
  await seedDefaultAccount().catch(() => {});
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------- Anmeldung (lokale Konten) ---------- */
const fails = new Map();
function checkLock(name) { const f = fails.get(name.toLowerCase()); if (f && f.count >= 5 && Date.now() < f.until) throw new Error('Zu viele Fehlversuche. Bitte warte 30 Sekunden.'); }
function noteFail(name) { const k = name.toLowerCase(); const f = fails.get(k) || { count: 0, until: 0 }; f.count++; if (f.count >= 5) { f.until = Date.now() + 30000; } fails.set(k, f); }

ipcMain.handle('auth:state', async () => {
  const accts = await readAccounts();
  const cfg = await readJson(GOOGLE_FILE(), {});
  const acc = current && accts.find(a => a.id === current.id);
  return { user: acc ? pub(acc) : null, hasAccounts: accts.length > 0, googleConfigured: !!(cfg.clientId && cfg.clientSecret) };
});
ipcMain.handle('auth:register', async (_e, { username, password }) => {
  username = String(username || '').trim(); password = String(password || '');
  if (!/^[\p{L}\p{N}_.-]{3,30}$/u.test(username)) throw new Error('Benutzername: 3–30 Zeichen (Buchstaben, Zahlen, _ . -).');
  if (['creator', 'admin'].includes(username.toLowerCase())) throw new Error('Dieser Benutzername ist reserviert.');
  if (password.length < 3) throw new Error('Das Passwort muss mindestens 3 Zeichen lang sein.');
  const accts = await readAccounts();
  if (accts.some(a => a.username.toLowerCase() === username.toLowerCase())) throw new Error('Dieser Benutzername ist schon vergeben.');
  const salt = crypto.randomBytes(16); const hash = await scrypt(password, salt);
  const acc = { id: randomUUID(), username, salt: salt.toString('hex'), hash: hash.toString('hex'), createdAt: Date.now() };
  accts.push(acc); await writeAccounts(accts); return startSession(acc);
});
ipcMain.handle('auth:login', async (_e, { username, password }) => {
  username = String(username || '').trim(); password = String(password || '');
  checkLock(username);
  const acc = (await readAccounts()).find(a => a.username.toLowerCase() === username.toLowerCase());
  if (!acc || !acc.hash) { noteFail(username); throw new Error('Benutzername oder Passwort ist falsch.'); }
  const hash = await scrypt(password, Buffer.from(acc.salt, 'hex'));
  if (!crypto.timingSafeEqual(hash, Buffer.from(acc.hash, 'hex'))) { noteFail(username); throw new Error('Benutzername oder Passwort ist falsch.'); }
  fails.delete(username.toLowerCase());
  return startSession(acc);
});
ipcMain.handle('auth:creator', async () => {
  let file = await findCreatorKey();
  if (!file) {
    const r = await dialog.showOpenDialog({ title: 'Creator-Schlüssel (creator.key) auswählen', properties: ['openFile'], filters: [{ name: 'Creator-Schlüssel', extensions: ['key'] }, { name: 'Alle Dateien', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) throw new Error('Kein Schlüssel ausgewählt.');
    file = r.filePaths[0];
  }
  const text = await fsp.readFile(file, 'utf8').catch(() => '');
  if (text.length > 500 || !keyIsValid(text)) throw new Error('Kein gültiger Creator-Schlüssel. Der Creator-Zugang ist nur für den Entwickler.');
  const accts = await readAccounts();
  let acc = accts.find(a => a.id === CREATOR_ID);
  if (!acc) { acc = { id: CREATOR_ID, username: 'Creator', display: 'Creator 👑', createdAt: Date.now() }; accts.push(acc); await writeAccounts(accts); }
  return startSession(acc);
});
ipcMain.handle('auth:logout', async () => { current = null; return true; });

/* ---------- Google-Anmeldung (OAuth 2.0, Desktop-Ablauf mit PKCE) ---------- */
ipcMain.handle('auth:google-config', async (_e, { clientId, clientSecret }) => {
  clientId = String(clientId || '').trim(); clientSecret = String(clientSecret || '').trim();
  if (!clientId || !clientSecret) throw new Error('Bitte Client-ID und Client-Secret eingeben.');
  await writeJson(GOOGLE_FILE(), { clientId, clientSecret }); return true;
});
async function googleProfile() {
  const cfg = await readJson(GOOGLE_FILE(), {});
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('Google ist noch nicht eingerichtet. Klicke auf „Google einrichten“.');
  const verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const state = b64u(crypto.randomBytes(16));
  const server = http.createServer();
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Zeitüberschreitung: Die Google-Anmeldung wurde nicht abgeschlossen.')), 180000);
      server.on('request', (req, res) => {
        const u = new URL(req.url, redirect);
        if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const c = u.searchParams.get('code'); const ok = c && u.searchParams.get('state') === state;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:Segoe UI,Arial;background:#071334;color:#eaf3ff;text-align:center;padding:70px"><h2>${ok ? 'Anmeldung erfolgreich' : 'Anmeldung fehlgeschlagen'}</h2><p>Du kannst dieses Fenster schließen und zu Blue Moth zurückkehren.</p></body>`);
        clearTimeout(timer);
        if (ok) resolve(c); else reject(new Error('Google hat die Anmeldung abgelehnt oder abgebrochen.'));
      });
      const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account' });
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params).catch(reject);
    });
    const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect }) });
    const tok = await resp.json().catch(() => ({}));
    if (!resp.ok || !tok.id_token) throw new Error('Google-Anmeldung fehlgeschlagen: ' + (tok.error_description || tok.error || resp.status));
    const p = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString('utf8'));
    return { sub: p.sub, email: p.email || '', name: p.name || p.email || 'Google-Nutzer' };
  } finally { server.close(); }
}
ipcMain.handle('auth:google', async () => {
  const g = await googleProfile(); const accts = await readAccounts();
  let acc = accts.find(a => a.googleSub === g.sub);
  if (!acc) {
    acc = { id: randomUUID(), username: g.email || ('google-' + g.sub.slice(0, 8)), display: g.name, googleSub: g.sub, googleEmail: g.email, createdAt: Date.now() };
    accts.push(acc); await writeAccounts(accts);
  }
  return startSession(acc);
});
ipcMain.handle('auth:google-link', async () => {
  need(); const g = await googleProfile(); const accts = await readAccounts();
  if (accts.some(a => a.googleSub === g.sub && a.id !== current.id)) throw new Error('Dieses Google-Konto ist bereits mit einem anderen Blue-Moth-Konto verknüpft.');
  const acc = accts.find(a => a.id === current.id); acc.googleSub = g.sub; acc.googleEmail = g.email;
  await writeAccounts(accts); return pub(acc);
});

/* ---------- Bibliothek ---------- */
ipcMain.handle('library:list', async () => readDb());
ipcMain.handle('library:add-url', async (_e, { name, url }) => {
  let u; try { u = new URL(url); } catch { throw new Error('Ungültige Webadresse.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Nur http:// und https:// sind erlaubt.');
  const items = await readDb(); items.unshift({ id: randomUUID(), name: String(name).trim(), kind: 'web', url: u.href, createdAt: Date.now() });
  await writeDb(items); return items;
});
ipcMain.handle('library:import', async (_e, kind) => {
  const items0 = await readDb();
  let filters, title;
  if (kind === 'app') { title = 'Programmdatei auswählen'; filters = [{ name: 'Windows-Programme', extensions: ['exe'] }]; }
  else if (kind === 'pcgame') { title = 'PC-Spiel oder Verknüpfung auswählen'; filters = [{ name: 'Spiele & Verknüpfungen', extensions: ['exe', 'lnk', 'url', 'bat'] }, { name: 'Alle Dateien', extensions: ['*'] }]; }
  else { title = 'Spiel- oder ROM-Datei auswählen'; filters = [{ name: 'Spiele & ROM-Dateien', extensions: ROM_EXT }, { name: 'Alle Dateien', extensions: ['*'] }]; }
  const result = await dialog.showOpenDialog({ title, properties: ['openFile', 'multiSelections'], filters });
  if (result.canceled || !result.filePaths.length) return items0;
  await fsp.mkdir(FILES_DIR(), { recursive: true });
  const items = items0;
  for (const src of result.filePaths) {
    const ext = path.extname(src).toLowerCase(); const name = path.basename(src, path.extname(src));
    if (kind === 'app' && ext !== '.exe') continue;
    if (kind === 'pcgame' && ext === '.url') {
      const m = /^URL=(.+)$/im.exec(await fsp.readFile(src, 'utf8').catch(() => ''));
      if (m && /^https?:\/\//i.test(m[1].trim())) { items.unshift({ id: randomUUID(), name, kind: 'web', url: new URL(m[1].trim()).href, createdAt: Date.now() }); continue; }
    }
    const copy = kind === 'game' || (kind === 'pcgame' && ['.lnk', '.url'].includes(ext));
    let dest = src;
    if (copy) { dest = path.join(FILES_DIR(), `${Date.now()}-${randomUUID()}${ext}`); await fsp.copyFile(src, dest); }
    items.unshift({ id: randomUUID(), name, kind, filename: path.basename(src), storedPath: dest, linked: !copy, system: kind === 'game' ? (SYSTEM_BY_EXT[ext.slice(1)] || null) : undefined, createdAt: Date.now() });
  }
  await writeDb(items); return items;
});
ipcMain.handle('library:remove', async (_e, id) => {
  const items = await readDb(); const item = items.find(x => x.id === id);
  if (item?.storedPath && !item.linked) { try { await fsp.unlink(item.storedPath); } catch {} }
  const next = items.filter(x => x.id !== id); await writeDb(next); return next;
});
ipcMain.handle('library:open', async (_e, id) => {
  const item = (await readDb()).find(x => x.id === id);
  if (!item) throw new Error('Eintrag nicht gefunden.');
  if (item.kind === 'web') {
    const r = await shell.openExternal(item.url).then(() => '', e => String(e.message || e));
    if (r) throw new Error(`Webseite konnte nicht geöffnet werden: ${r}`);
    return 'Webseite wurde im Standardbrowser geöffnet.';
  }
  if (!item.storedPath || !fs.existsSync(item.storedPath)) throw new Error(`Die Datei fehlt: ${item.filename || item.name}. Sie wurde verschoben oder gelöscht. Bitte Eintrag entfernen und neu hinzufügen.`);
  if (item.kind === 'app' || item.kind === 'pcgame') {
    const err = await shell.openPath(item.storedPath); // ShellExecute: EXE, LNK, URL, Admin-Abfrage
    if (err) throw new Error(`Windows konnte das nicht starten: ${err}`);
    return 'Wird gestartet.';
  }
  shell.showItemInFolder(item.storedPath);
  return 'Datei im Explorer angezeigt.';
});
ipcMain.handle('library:show-file', async (_e, id) => { const item = (await readDb()).find(x => x.id === id); if (item?.storedPath) shell.showItemInFolder(item.storedPath); });

/* ---------- Eingebauter Emulator (EmulatorJS) ---------- */
ipcMain.handle('games:play', async (_e, { id, system }) => {
  const items = await readDb(); const game = items.find(x => x.id === id && x.kind === 'game');
  if (!game || !game.storedPath || !fs.existsSync(game.storedPath)) throw new Error('Spieldatei nicht gefunden. Bitte neu importieren.');
  if (!SYSTEM_IDS.has(system)) throw new Error('Bitte zuerst das passende System auswählen.');
  game.system = system; await writeDb(items);
  const token = randomUUID(); ROM_TOKENS.set(token, game.storedPath);
  const win = new BrowserWindow({ width: 1024, height: 768, title: `Blue Moth – ${game.name}`, icon: path.join(__dirname, 'assets/moth_icon.png'), backgroundColor: '#000000', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('closed', () => ROM_TOKENS.delete(token));
  const q = new URLSearchParams({ core: system, name: game.name, rom: `${token}/${encodeURIComponent(game.filename || 'game')}` });
  await win.loadURL(`bluemoth://app/player.html?${q}`);
  return 'Spiel wird im eingebauten Player gestartet.';
});
ipcMain.handle('games:choose-emulator', async () => { const r = await dialog.showOpenDialog({ title: 'Installierten Emulator auswählen', properties: ['openFile'], filters: [{ name: 'Programme', extensions: ['exe'] }] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('games:launch-with-emulator', async (_e, { id, emulatorPath }) => {
  const game = (await readDb()).find(x => x.id === id && x.kind === 'game');
  if (!game || !game.storedPath || !fs.existsSync(game.storedPath)) throw new Error('Spieldatei nicht gefunden. Bitte neu importieren.');
  if (!emulatorPath || !fs.existsSync(emulatorPath)) throw new Error('Bitte einen gültigen, installierten Emulator auswählen.');
  const { spawn } = require('node:child_process');
  await new Promise((resolve, reject) => {
    const c = spawn(emulatorPath, [game.storedPath], { cwd: path.dirname(emulatorPath), detached: true, stdio: 'ignore' });
    c.once('spawn', () => { c.unref(); resolve(); });
    c.once('error', err => reject(new Error(`Emulator konnte nicht gestartet werden: ${err.message}`)));
  });
  return 'Spiel wurde an den Emulator übergeben.';
});

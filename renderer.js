const $ = id => document.getElementById(id);
const api = window.blueMoth;
let items = [], filter = 'all', selectedGame = null, authMode = 'login', user = null, googleConfigured = false;
const SYSTEMS = [['nes','NES'],['snes','SNES / Super Famicom'],['gb','Game Boy / Color'],['gba','Game Boy Advance'],['segaMD','Sega Mega Drive / Genesis'],['segaMS','Sega Master System'],['segaGG','Sega Game Gear'],['pce','PC Engine'],['n64','Nintendo 64'],['nds','Nintendo DS'],['psx','PlayStation 1']];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = e => String(e?.message || e || 'Unbekannter Fehler').replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 3500); }
const LABEL = { web: 'WEB-APP', app: 'PROGRAMM', pcgame: 'PC-SPIEL', game: 'RETRO-SPIEL' };
const SYMBOL = { web: '↗', app: 'EXE', pcgame: '🕹', game: '🎮' };
function iconMarkup(x) {
  if (x.kind === 'web' && x.url) {
    try {
      const host = new URL(x.url).hostname;
      const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
      return `<img class="item-logo" src="${src}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${SYMBOL.web}'">`;
    } catch {}
  }
  return SYMBOL[x.kind] || '📦';
}

/* ----- Bibliothek ----- */
function render() {
  const shown = items.filter(x => filter === 'all' || x.kind === filter);
  $('count').textContent = `${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`;
  $('empty').hidden = shown.length > 0;
  $('grid').innerHTML = shown.map(x => `<article class="card"><div class="symbol">${iconMarkup(x)}</div><div class="kind">${LABEL[x.kind]}</div><h3>${esc(x.name)}</h3><p class="filename">${esc(x.filename || x.url || '')}</p><div class="cardActions">${
    x.kind === 'game' ? `<button data-game="${x.id}" class="primary">▶ Spielen</button><button data-file="${x.id}" class="secondary">Datei</button>`
    : `<button data-open="${x.id}" class="primary">${x.kind === 'web' ? 'Öffnen ↗' : 'Starten ▶'}</button>`}<button data-delete="${x.id}" class="delete" title="Entfernen">×</button></div></article>`).join('');
}
async function refresh() { items = await api.list(); render(); }
async function doImport(kind, okMsg) { try { const n = items.length; items = await api.importFile(kind); render(); if (items.length > n) toast(okMsg); } catch (e) { toast(clean(e)); } }
$('addUrl').onclick = () => $('urlDialog').showModal();
$('addExe').onclick = () => doImport('app', 'Programm hinzugefügt.');
$('addPc').onclick = () => doImport('pcgame', 'Hinzugefügt.');
$('addGame').onclick = () => doImport('game', 'Spiel hinzugefügt.');
$('urlForm').onsubmit = async e => { e.preventDefault(); try { items = await api.addUrl({ name: $('urlName').value, url: $('urlValue').value }); $('urlDialog').close(); $('urlForm').reset(); render(); toast('Web-App hinzugefügt.'); } catch (err) { toast(clean(err)); } };
document.querySelectorAll('.close').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('nav .tab').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('nav .tab').forEach(t => t.classList.toggle('active', t === b)); render(); });
$('grid').addEventListener('click', async e => {
  const open = e.target.closest('[data-open]'), del = e.target.closest('[data-delete]'), game = e.target.closest('[data-game]'), file = e.target.closest('[data-file]');
  try {
    if (open) toast(await api.open(open.dataset.open));
    if (file) await api.showFile(file.dataset.file);
    if (del && confirm('Diesen Eintrag entfernen? (Originaldateien von Programmen bleiben erhalten.)')) { items = await api.remove(del.dataset.delete); render(); toast('Eintrag entfernt.'); }
    if (game) { selectedGame = game.dataset.game; const item = items.find(x => x.id === selectedGame); $('gameName').textContent = item?.filename || item?.name; $('systemSelect').value = item?.system || ''; $('emulatorDialog').showModal(); }
  } catch (err) { toast(clean(err)); }
});
$('systemSelect').innerHTML = '<option value="">Bitte System wählen …</option>' + SYSTEMS.map(([id, n]) => `<option value="${id}">${n}</option>`).join('');
$('playBuiltin').onclick = async () => { try { const msg = await api.play({ id: selectedGame, system: $('systemSelect').value }); $('emulatorDialog').close(); items = await api.list(); toast(msg); } catch (e) { toast(clean(e)); } };
$('chooseEmulator').onclick = async () => { try { const p = await api.chooseEmulator(); if (!p) return; const msg = await api.launchWithEmulator({ id: selectedGame, emulatorPath: p }); $('emulatorDialog').close(); toast(msg); } catch (e) { toast(clean(e)); } };

/* ----- Anmeldung ----- */
function setAuthMode(mode) {
  authMode = mode; const reg = mode === 'register';
  $('tabLogin').classList.toggle('active', !reg); $('tabRegister').classList.toggle('active', reg);
  $('pass2Row').hidden = !reg; $('authPass2').required = reg;
  $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('authSubmit').textContent = reg ? 'Konto erstellen' : 'Anmelden';
  $('authHint').textContent = reg ? 'Erstelle dein Konto für diesen PC.' : 'Melde dich an, um deine Bibliothek zu öffnen.';
  $('authMsg').textContent = '';
}
function enterApp() {
  $('userName').textContent = '👤 ' + (user.display || user.username) + (user.googleEmail ? ' · ' + user.googleEmail : '');
  $('linkGoogle').hidden = !!user.googleEmail;
  document.body.classList.remove('locked'); filter = 'all';
  document.querySelectorAll('nav .tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
  refresh();
}
$('tabLogin').onclick = () => setAuthMode('login');
$('tabRegister').onclick = () => setAuthMode('register');
$('authForm').onsubmit = async e => {
  e.preventDefault(); $('authMsg').textContent = '';
  const username = $('authUser').value, password = $('authPass').value;
  try {
    if (authMode === 'register') { if (password !== $('authPass2').value) throw new Error('Die Passwörter stimmen nicht überein.'); user = await api.register({ username, password }); }
    else user = await api.login({ username, password });
    $('authForm').reset(); enterApp();
  } catch (err) { $('authMsg').textContent = clean(err); }
};
async function googleFlow(fn, onOk) {
  if (!googleConfigured) { $('googleDialog').showModal(); return; }
  const btn = $('googleBtn'), old = btn.textContent; btn.disabled = true; btn.textContent = 'Warte auf Google … (Browser öffnet sich)';
  try { user = await fn(); onOk(); } catch (err) { $('authMsg').textContent = clean(err); toast(clean(err)); }
  finally { btn.disabled = false; btn.textContent = old; }
}
$('googleBtn').onclick = () => googleFlow(api.google, enterApp);
$('creatorBtn').onclick = async () => { $('authMsg').textContent = ''; try { user = await api.creator(); enterApp(); } catch (err) { $('authMsg').textContent = clean(err); } };
$('googleSetup').onclick = () => $('googleDialog').showModal();
$('googleForm').onsubmit = async e => { e.preventDefault(); try { await api.googleConfig({ clientId: $('gId').value, clientSecret: $('gSecret').value }); googleConfigured = true; $('googleDialog').close(); $('googleForm').reset(); toast('Google gespeichert. Jetzt „Mit Google anmelden“ klicken.'); } catch (err) { toast(clean(err)); } };
$('linkGoogle').onclick = async () => {
  if (!googleConfigured) { $('googleDialog').showModal(); return; }
  try { toast('Browser öffnet sich …'); user = await api.googleLink(); enterApp(); toast('Google-Konto verknüpft.'); } catch (err) { toast(clean(err)); }
};
$('logout').onclick = async () => { await api.logout(); user = null; items = []; document.body.classList.add('locked'); setAuthMode('login'); };

(async () => {
  const s = await api.state(); googleConfigured = s.googleConfigured;
  setAuthMode(s.hasAccounts ? 'login' : 'register');
  if (s.user) { user = s.user; enterApp(); }
})();
setTimeout(() => $('splash').classList.add('hide'), 1500);

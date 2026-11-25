const q = new URLSearchParams(location.search);
const DATA = 'https://cdn.emulatorjs.org/stable/data/';
window.EJS_player = '#game';
window.EJS_core = q.get('core');
window.EJS_gameUrl = 'bluemoth://rom/' + q.get('rom');
window.EJS_gameName = q.get('name') || 'Spiel';
window.EJS_pathtodata = DATA;
window.EJS_startOnLoaded = true;
window.EJS_color = '#2d83e6';
const s = document.createElement('script');
s.src = DATA + 'loader.js';
s.onerror = () => {
  const m = document.getElementById('msg'); m.style.display = 'grid';
  m.textContent = 'Der Emulator konnte nicht geladen werden. Für den Emulator-Kern wird eine Internetverbindung benötigt. Bitte prüfe deine Verbindung und starte das Spiel erneut.';
};
document.body.appendChild(s);

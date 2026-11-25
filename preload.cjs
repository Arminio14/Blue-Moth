const { contextBridge, ipcRenderer } = require('electron');
const call = ch => data => ipcRenderer.invoke(ch, data);
contextBridge.exposeInMainWorld('blueMoth', {
  state: call('auth:state'), register: call('auth:register'), login: call('auth:login'), logout: call('auth:logout'), creator: call('auth:creator'),
  google: call('auth:google'), googleLink: call('auth:google-link'), googleConfig: call('auth:google-config'),
  list: call('library:list'), addUrl: call('library:add-url'), importFile: call('library:import'), remove: call('library:remove'),
  open: call('library:open'), showFile: call('library:show-file'),
  play: call('games:play'), chooseEmulator: call('games:choose-emulator'), launchWithEmulator: call('games:launch-with-emulator')
});

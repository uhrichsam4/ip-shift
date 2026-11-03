import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('ipshiftNative', {
  platform: 'windows',
  invoke: (cmd: string, args: unknown) => ipcRenderer.invoke('ipshift:invoke', { cmd, args }),
  onEvent: (listener: (e: unknown) => void) => {
    const h = (_e: IpcRendererEvent, ev: unknown) => listener(ev);
    ipcRenderer.on('ipshift:event', h);
    return () => { ipcRenderer.removeListener('ipshift:event', h); };
  },
});

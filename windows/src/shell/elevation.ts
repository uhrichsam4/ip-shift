/** Elevation detection and UAC relaunch via koffi (no shell, no child processes). */
let shell32: any = null;
function lib(): any {
  if (process.platform !== 'win32') return null;
  if (!shell32) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi');
    shell32 = koffi.load('shell32.dll');
  }
  return shell32;
}

export function isElevated(): boolean {
  try {
    const l = lib();
    if (!l) return false;
    const IsUserAnAdmin = l.func('__stdcall', 'IsUserAnAdmin', 'int', []);
    return IsUserAnAdmin() !== 0;
  } catch {
    return false;
  }
}

function quoteArg(a: string): string {
  if (a && !/[\s"]/.test(a)) return a;
  return '"' + a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

/** Returns true when ShellExecuteW accepted the 'runas' request (> 32). */
export function relaunchElevated(execPath: string, args: string[]): boolean {
  const l = lib();
  if (!l) return false;
  const ShellExecuteW = l.func('__stdcall', 'ShellExecuteW', 'intptr_t', ['void *', 'str16', 'str16', 'str16', 'void *', 'int']);
  const SW_SHOWNORMAL = 1;
  const r = ShellExecuteW(null, 'runas', execPath, args.map(quoteArg).join(' '), null, SW_SHOWNORMAL);
  return Number(r) > 32;
}

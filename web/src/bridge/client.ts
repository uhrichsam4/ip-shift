import type { BridgeError, BridgeEvent, BridgeReply, CommandName, Commands } from './protocol';
import { createPreviewBridge, type PreviewBridge } from './preview';

declare global {
  interface Window {
    webkit?: { messageHandlers?: { ipshift?: { postMessage: (msg: unknown) => Promise<unknown> } } };
    __IPSHIFT__?: { dispatch: (event: BridgeEvent) => void };
    /** Electron (Windows) preload transport — see windows/src/backend/contract.ts. */
    ipshiftNative?: {
      platform: 'windows';
      invoke: (cmd: string, args: unknown) => Promise<BridgeReply<unknown>>;
      onEvent: (listener: (e: BridgeEvent) => void) => () => void;
    };
  }
}

export class BridgeCallError extends Error implements BridgeError {
  code: BridgeError['code'];
  stage?: BridgeError['stage'];
  constructor(e: BridgeError) {
    super(e.message);
    this.code = e.code;
    this.stage = e.stage;
  }
}

type Listener = (e: BridgeEvent) => void;
const listeners = new Set<Listener>();

export function onBridgeEvent(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function dispatch(event: BridgeEvent) {
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.error('[bridge] listener failed', err);
    }
  }
}

const electronBridge = typeof window !== 'undefined' ? window.ipshiftNative : undefined;
const nativeHandler = !electronBridge && typeof window !== 'undefined' ? window.webkit?.messageHandlers?.ipshift : undefined;
export const isNative = !!electronBridge || !!nativeHandler;
/** Platform the transport implies (AppInfo.platform takes precedence once known). */
export const transportPlatform: 'windows' | 'macos' | null = electronBridge ? 'windows' : nativeHandler ? 'macos' : null;

let preview: PreviewBridge | null = null;

if (typeof window !== 'undefined') {
  window.__IPSHIFT__ = { dispatch };
  if (electronBridge) electronBridge.onEvent(dispatch);
  if (!isNative) preview = createPreviewBridge(dispatch);
}

export function getPreview() {
  return preview;
}

export async function call<K extends CommandName>(
  cmd: K,
  ...rest: Commands[K]['args'] extends void ? [] : [Commands[K]['args']]
): Promise<Commands[K]['result']> {
  const args = rest[0];
  let reply: BridgeReply<Commands[K]['result']>;
  if (electronBridge) {
    reply = (await electronBridge.invoke(cmd, args ?? {})) as BridgeReply<Commands[K]['result']>;
  } else if (nativeHandler) {
    reply = (await nativeHandler.postMessage({ cmd, args: args ?? {} })) as BridgeReply<Commands[K]['result']>;
  } else {
    reply = await preview!.call(cmd, args as Commands[K]['args']);
  }
  if (!reply || typeof reply !== 'object') throw new BridgeCallError({ code: 'internal', message: 'The app did not reply.' });
  if (reply.ok) return reply.data;
  throw new BridgeCallError(reply.error);
}

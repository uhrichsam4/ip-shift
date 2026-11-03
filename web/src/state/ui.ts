/** UI-only state (not read by the scene). */
import { create } from 'zustand';
import type { DiagnosticReport } from '../bridge/protocol';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'danger';
}

interface UIState {
  toasts: Toast[];
  confirmOpen: boolean;
  clearHistoryOpen: boolean;
  announcement: string;
  introDone: boolean;
  refreshing: boolean;
  diagnostics: DiagnosticReport | null;
  diagnosticsRunning: boolean;
  lastError: string | null;
  set: (p: Partial<UIState>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  announce: (text: string) => void;
}

let tid = 1;

export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  confirmOpen: false,
  clearHistoryOpen: false,
  announcement: '',
  introDone: false,
  refreshing: false,
  diagnostics: null,
  diagnosticsRunning: false,
  lastError: null,
  set: (p) => set(p),
  toast: (text, tone = 'info') => {
    const id = tid++;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-3) });
    window.setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  announce: (text) => set({ announcement: text }),
}));

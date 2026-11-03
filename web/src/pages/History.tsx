import { useState } from 'react';
import { useAppStore } from '../state/store';
import { useUI } from '../state/ui';
import { clearHistory, exportHistory, requestSwitch } from '../state/actions';
import { DASH, dateTime, duration } from '../state/format';
import { Btn, Modal } from '../ui/primitives';
import { IconArrowRight, IconBolt, IconChevron, IconExternal, IconHistory } from '../design/icons';
import type { HistoryEntry } from '../bridge/protocol';
import { OS } from '../state/os';

const VERDICT: Record<HistoryEntry['outcome'], { label: string; cls: string }> = {
  changed: { label: 'Changed', cls: 'b-success' },
  unchanged: { label: 'Same address', cls: 'b-blue' },
  failed: { label: 'Failed', cls: 'b-danger' },
  cancelled: { label: 'Cancelled', cls: 'b-neutral' },
};

export function HistoryPage() {
  const history = useAppStore((s) => s.history);
  const clearOpen = useUI((s) => s.clearHistoryOpen);
  const [open, setOpen] = useState<string | null>(null);

  const total = history.length;
  const changed = history.filter((h) => h.outcome === 'changed').length;
  const avg = total ? history.reduce((a, h) => a + h.durationMs, 0) / total : null;

  return (
    <div className="page">
      <header className="page-head page-anim row-between">
        <div>
          <h1 className="t-headline">History</h1>
          <p className="t-body muted">Every switch, as {OS} reported it.</p>
        </div>
        <div className="head-actions">
          <Btn variant="secondary" onClick={exportHistory} disabled={!total}>
            <IconExternal size={15} /> Export
          </Btn>
          <Btn variant="ghost" onClick={() => useUI.getState().set({ clearHistoryOpen: true })} disabled={!total}>
            Clear
          </Btn>
        </div>
      </header>

      {total === 0 ? (
        <div className="empty glass-1 page-anim">
          <div className="empty-glyph" aria-hidden>
            <IconHistory size={36} />
          </div>
          <h2 className="t-title">No switches yet</h2>
          <p className="t-body muted">When you switch your IP, each attempt and its verified result appears here.</p>
          <Btn variant="primary" onClick={requestSwitch}>
            <IconBolt size={15} /> Switch IP
          </Btn>
        </div>
      ) : (
        <>
          <div className="summary page-anim">
            <div className="sum glass-1">
              <span className="t-micro muted">Total switches</span>
              <span className="t-data-l mono grad-num">{total}</span>
            </div>
            <div className="sum glass-1">
              <span className="t-micro muted">Address changed</span>
              <span className="t-data-l mono grad-num">{Math.round((changed / total) * 100)}%</span>
            </div>
            <div className="sum glass-1">
              <span className="t-micro muted">Average duration</span>
              <span className="t-data-l mono grad-num">{duration(avg)}</span>
            </div>
          </div>
          <div className="table glass-1 page-anim" role="table" aria-label="Switch history">
            <div className="tr th t-micro muted" role="row">
              <span role="columnheader">Time</span>
              <span role="columnheader">Mode</span>
              <span role="columnheader">Previous → New</span>
              <span role="columnheader">Verdict</span>
              <span role="columnheader">Internet</span>
              <span role="columnheader">Duration</span>
              <span />
            </div>
            {history.map((h) => {
              const vd = VERDICT[h.outcome];
              const expandable = !!h.failure;
              const isOpen = open === h.id;
              return (
                <div key={h.id} className="tr-wrap">
                  <div
                    className={`tr ${expandable ? 'clickable' : ''}`}
                    role="row"
                    onClick={() => expandable && setOpen(isOpen ? null : h.id)}
                    tabIndex={expandable ? 0 : undefined}
                    onKeyDown={(e) => expandable && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(isOpen ? null : h.id))}
                    aria-expanded={expandable ? isOpen : undefined}
                  >
                    <span className="mono t-body">{dateTime(h.startedAt)}</span>
                    <span className="t-body">{h.mode === 'renew' ? 'Renew lease' : 'Reconnect + renew'}</span>
                    <span className="mono t-body ips">
                      {h.outcome === 'changed' ? (
                        <>
                          <span className="muted">{h.previousIP ?? DASH}</span> <IconArrowRight size={12} /> {h.currentIP ?? DASH}
                        </>
                      ) : (
                        <>
                          <span className="muted">{h.previousIP ?? DASH}</span> <span className="muted">· No change</span>
                        </>
                      )}
                    </span>
                    <span>
                      <span className={`badge ${vd.cls}`}>{vd.label}</span>
                    </span>
                    <span className="t-body">
                      {h.internet === 'restored' ? `Restored${h.internetLatencyMs != null ? ` · ${h.internetLatencyMs} ms` : ''}` : h.internet === 'unavailable' ? 'Unavailable' : <span className="muted">Not checked</span>}
                    </span>
                    <span className="mono t-body">{duration(h.durationMs)}</span>
                    <span className="chev">{expandable && <IconChevron size={14} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} />}</span>
                  </div>
                  {isOpen && h.failure && (
                    <div className="tr-detail t-body">
                      <span className="badge b-danger">{h.failure.stage}</span>
                      <span className="mono muted">{h.failure.code}</span>
                      <span>{h.failure.message}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <Modal open={clearOpen} onClose={() => useUI.getState().set({ clearHistoryOpen: false })} label="Clear history">
        <h2 className="t-title">Clear all history?</h2>
        <p className="t-body muted" style={{ margin: '8px 0 20px' }}>
          This removes {total} {total === 1 ? 'entry' : 'entries'} from this Mac. It does not affect your network.
        </p>
        <div className="confirm-actions">
          <Btn variant="ghost" onClick={() => useUI.getState().set({ clearHistoryOpen: false })}>
            Cancel
          </Btn>
          <Btn variant="danger" onClick={clearHistory} autoFocus>
            Clear history
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

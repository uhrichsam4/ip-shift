import { useLayoutEffect, useRef } from 'react';
import { useUI } from '../state/ui';
import { copyText, runDiagnostics } from '../state/actions';
import { dateTime, duration } from '../state/format';
import { staggerIn } from '../motion';
import { Btn } from '../ui/primitives';
import { IconCheck, IconCopy, IconDiagnostics, IconError, IconWarning } from '../design/icons';
import type { DiagnosticReport } from '../bridge/protocol';

function report(r: DiagnosticReport) {
  const lines = [`IP SHIFT diagnostics — ${r.ranAt}`, ''];
  for (const c of r.checks) lines.push(`[${c.status.toUpperCase().padEnd(7)}] ${c.label}: ${c.detail} (${c.durationMs} ms)`);
  return lines.join('\n');
}

export function DiagnosticsPage() {
  const r = useUI((s) => s.diagnostics);
  const running = useUI((s) => s.diagnosticsRunning);
  const listRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    if (r && listRef.current) staggerIn(listRef.current.querySelectorAll('.diag'), { each: 0.06 });
  }, [r]);
  const counts = r ? { pass: r.checks.filter((c) => c.status === 'pass').length, warn: r.checks.filter((c) => c.status === 'warn').length, fail: r.checks.filter((c) => c.status === 'fail').length } : null;

  return (
    <div className="page">
      <header className="page-head page-anim row-between">
        <div>
          <h1 className="t-headline">Diagnostics</h1>
          <p className="t-body muted">Checks each layer between this Mac and the internet. Read-only — nothing is changed.</p>
        </div>
        <div className="head-actions">
          {r && (
            <Btn variant="secondary" onClick={() => copyText(report(r), 'Report copied')}>
              <IconCopy size={15} /> Copy report
            </Btn>
          )}
          <Btn variant="primary" onClick={runDiagnostics} disabled={running}>
            <IconDiagnostics size={15} /> {running ? 'Running…' : r ? 'Run again' : 'Run diagnostics'}
          </Btn>
        </div>
      </header>

      {!r && !running && (
        <div className="empty glass-1 page-anim">
          <div className="empty-glyph" aria-hidden>
            <IconDiagnostics size={36} />
          </div>
          <h2 className="t-title">Ready when you are</h2>
          <p className="t-body muted">Ten checks: interface, power, association, IPv4, DHCP lease, router, DNS, internet, public IP and Location.</p>
        </div>
      )}
      {running && (
        <div className="diag-running glass-1 page-anim" aria-live="polite">
          <span className="hairline-progress" />
          <span className="t-body muted">Running checks…</span>
        </div>
      )}
      {r && (
        <>
          <div className="diag-summary t-body page-anim">
            <span className="badge b-success">{counts!.pass} passed</span>
            {counts!.warn > 0 && <span className="badge b-warning">{counts!.warn} warning{counts!.warn > 1 ? 's' : ''}</span>}
            {counts!.fail > 0 && <span className="badge b-danger">{counts!.fail} failed</span>}
            <span className="muted mono t-caption">Ran {dateTime(r.ranAt)}</span>
          </div>
          <ul className="diag-list glass-1" ref={listRef}>
            {r.checks.map((c) => (
              <li key={c.id} className={`diag diag-${c.status}`}>
                <span className="diag-icon">
                  {c.status === 'pass' ? <IconCheck size={15} strokeWidth={2} /> : c.status === 'warn' ? <IconWarning size={15} /> : c.status === 'fail' ? <IconError size={15} /> : <span className="dash-mark" />}
                </span>
                <span className="t-title-s diag-label">{c.label}</span>
                <span className="t-body muted diag-detail">{c.detail}</span>
                <span className="mono t-caption muted">{c.status === 'skipped' ? 'skipped' : duration(c.durationMs)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

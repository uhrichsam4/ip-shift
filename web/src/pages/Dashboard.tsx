import { useAppStore } from '../state/store';
import { InfoPanel, RecentActivity } from '../ui/Dashboard.parts';
import { SwitchButton } from '../ui/SwitchButton';

/** Dashboard chrome. The StageHUD / EventLog / Results live at App level so they survive page changes. */
export function Dashboard() {
  const sceneMode = useAppStore((s) => s.sceneMode);
  const resultsOpen = useAppStore((s) => s.resultsOpen);
  const running = useAppStore((s) => s.operation.running);
  // DESIGN.md §10: while the camera flies (and while results are open) the dashboard chrome steps back.
  const away = sceneMode !== 'idle' || running || resultsOpen;
  return (
    <div className="dash">
      <div className={`dash-chrome ${away ? 'away' : ''}`} aria-hidden={away || undefined}>
        <div className="dash-right page-anim">
          <InfoPanel />
        </div>
        <div className="dash-bottom page-anim">
          <RecentActivity />
        </div>
      </div>
      <div className={`dash-switch page-anim ${resultsOpen ? 'away' : ''}`}>
        <SwitchButton />
      </div>
    </div>
  );
}

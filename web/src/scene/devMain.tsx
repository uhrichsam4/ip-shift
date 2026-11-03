// DEV ONLY entry: mounts the stage alone at /src/scene/dev.html?scene=...
import { createRoot } from 'react-dom/client';
import { Stage } from './Stage';
createRoot(document.getElementById('root')!).render(<Stage />);

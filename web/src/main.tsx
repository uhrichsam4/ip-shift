import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/unbounded';
import './design/tokens.css';
import './ui/ui.css';
import './motion/eases';
import { init } from './state/actions';
import App from './App';

init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

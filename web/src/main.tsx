import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecordedReplay } from './silent/RecordedReplay.tsx';
import { SilentWorkspace } from './SilentWorkspace.tsx';
import { CallerPage } from './CallerPage.tsx';
import './styles.css';

function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  if (new URLSearchParams(location.search).get('replay') === '1') return <RecordedReplay />;
  return hash === '#caller' ? <CallerPage /> : <SilentWorkspace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

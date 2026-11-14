import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  return hash === '#caller' ? <CallerPage /> : <SilentWorkspace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { useEffect, useRef, useState } from 'react';
import Experience from './Experience/Experience';
import './styles/loader.css';
import LoginRegister from './components/LoginRegister';
import { getToken, me, logout as clearToken } from './services/auth';

const App = () => {
  const canvasRef = useRef();
  const experienceRef = useRef(null);

  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [authKey, setAuthKey] = useState(0);
  const [authStartTab, setAuthStartTab] = useState('login');
  const [gameKey, setGameKey] = useState(0);

  useEffect(() => {
    (async () => {
      const t = getToken();
      if (!t) return;
      try { await me(); setAuthed(true); }
      catch { clearToken(); setAuthed(false); }
    })();
  }, []);

  // Monta Experience cada vez que authed o gameKey cambien
  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    setProgress(0);

    // Definir handlers con nombre para poder removerlos correctamente
    const onProgress = (e) => setProgress(e.detail);
    const onComplete = () => setLoading(false);

    const timeout = setTimeout(() => {
      const exp = new Experience(canvasRef.current);
      experienceRef.current = exp;

      window.addEventListener('resource-progress', onProgress);
      window.addEventListener('resource-complete', onComplete);
    }, 100);

    return () => {
      clearTimeout(timeout);
      // ✅ Pasar las mismas referencias de función
      window.removeEventListener('resource-progress', onProgress);
      window.removeEventListener('resource-complete', onComplete);
      setLoading(false);
      if (experienceRef.current?.destroy) experienceRef.current.destroy();
      experienceRef.current = null;
    };
  }, [authed, gameKey]);

  // Expone función global para reiniciar el juego desde Experience
  useEffect(() => {
    window.restartGame = () => {
      console.log('♻️ Reiniciando juego desde React...');
      setGameKey(k => k + 1);
    };
    return () => { delete window.restartGame; };
  }, []);

  const handleLogout = () => {
    clearToken();
    setAuthed(false);
    setAuthStartTab('login');
    setAuthKey(k => k + 1);
    setProgress(0);
    setGameKey(0);
  };

  return (
    <>
      {!authed && (
        <LoginRegister
          key={`auth-${authKey}`}
          initialTab={authStartTab}
          onAuthed={() => setAuthed(true)}
        />
      )}

      {authed && (
        <button
          onClick={handleLogout}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: '#c0392b', color: '#fff', border: 'none',
            padding: '8px 12px', borderRadius: 6, cursor: 'pointer'
          }}
          title="Cerrar sesión"
        >
          Salir
        </button>
      )}

      {authed && loading && (
        <div id="loader-overlay">
          <div id="loader-bar" style={{ width: `${progress}%` }} />
          <div id="loader-text">Cargando... {progress}%</div>
        </div>
      )}

      <canvas ref={canvasRef} className="webgl" />
    </>
  );
};

export default App;

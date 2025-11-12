import { useEffect, useState } from 'react';
import { login, register } from '../services/auth';

export default function LoginRegister({ onAuthed, initialTab = 'login' }) {
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Si initialTab cambia (por key nuevo), sincroniza pestaña visible
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      if (tab === 'login') {
        const payload = await login({ email, password });
        onAuthed?.(payload);               // entra al juego solo aquí
        setMsg('¡Bienvenido!');
      } else {
        await register({ email, password, name });
        setTab('login');                   // vuelve al login tras registro
        setPassword('');
        setMsg('Cuenta creada. Inicia sesión.');
      }
    } catch (err) {
      setMsg(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: 360,
        maxWidth: '92vw',
        background: '#111',
        color: '#fff',
        borderRadius: 10,
        padding: 20,
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setTab('login')}
            style={{ flex: 1, padding: 8, background: tab==='login'?'#27ae60':'#333', color:'#fff', border:'none', borderRadius:6 }}>
            Login
          </button>
          <button onClick={() => setTab('register')}
            style={{ flex: 1, padding: 8, background: tab==='register'?'#27ae60':'#333', color:'#fff', border:'none', borderRadius:6 }}>
            Register
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          {tab === 'register' && (
            <input
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              required
              style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background:'#222', color:'#fff' }}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background:'#222', color:'#fff' }}
          />

          <input
            type="password"
            placeholder="Contraseña (mín. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{ padding: 8, borderRadius: 6, border: '1px solid #444', background:'#222', color:'#fff' }}
          />

          <button disabled={loading} type="submit"
            style={{ padding: 10, background: '#27ae60', color:'#fff', border: 'none', borderRadius: 6 }}>
            {loading ? 'Enviando...' : (tab === 'login' ? 'Entrar' : 'Crear cuenta')}
          </button>

          {msg && <div style={{ fontSize: 12, opacity: 0.9 }}>{msg}</div>}
        </form>
      </div>
    </div>
  );
}

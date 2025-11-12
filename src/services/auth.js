// src/services/auth.js
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function saveToken(t) { localStorage.setItem('token', t); }
export function getToken() { return localStorage.getItem('token'); }
export function logout() { localStorage.removeItem('token'); }
export function authHeader() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function register({ email, password, name }) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error en registro');
  // Importante: NO guardar token aquí
  return data;
}

export async function login({ email, password }) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Error en login');
  if (data.token) saveToken(data.token);
  return data;
}

export async function me() {
  const res = await fetch(`${API}/api/auth/me`, { headers: { ...authHeader() } });
  if (!res.ok) throw new Error('No autenticado');
  return res.json();
}

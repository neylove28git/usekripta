import { createClient, type Session, type User } from '@supabase/supabase-js';

export interface KriptaUser {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar: string;
}

export interface KriptaSession {
  user: KriptaUser;
  createdAt: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY não foram configuradas.');
}

let rememberSession = localStorage.getItem('kripta.remember') === 'true';
const adaptiveStorage = {
  getItem(key: string) {
    const localValue = localStorage.getItem(key);
    if (localValue) {
      rememberSession = true;
      return localValue;
    }
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) rememberSession = false;
    return sessionValue;
  },
  setItem(key: string, value: string) {
    const target = rememberSession ? localStorage : sessionStorage;
    const other = rememberSession ? sessionStorage : localStorage;
    other.removeItem(key);
    target.setItem(key, value);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: adaptiveStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let currentSession: KriptaSession | null = null;
let initialized = false;
let initializing: Promise<KriptaSession | null> | null = null;
const listeners = new Set<(session: KriptaSession | null, ready: boolean) => void>();

const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^\d+/, '').slice(0, 24) || 'usuario';

function mapUser(user: User): KriptaUser {
  const metadata = user.user_metadata ?? {};
  const name = String(metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Usuario');
  return {
    id: user.id,
    name,
    email: user.email || '',
    username: String(metadata.username || slug(name)),
    avatar: String(metadata.avatar_url || '/assets/fotodeperfil.png'),
  };
}

function mapSession(session: Session | null): KriptaSession | null {
  return session ? { user: mapUser(session.user), createdAt: new Date(session.user.created_at).toISOString() } : null;
}

function notify() {
  listeners.forEach((listener) => listener(currentSession, initialized));
}

supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = mapSession(session);
  initialized = true;
  notify();
});

export function initializeAuth() {
  if (initializing) return initializing;
  initializing = supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    currentSession = mapSession(data.session);
    initialized = true;
    notify();
    return currentSession;
  }).catch((error) => {
    console.error('Falha ao restaurar a sessão do Supabase.', error);
    initialized = true;
    notify();
    return null;
  });
  return initializing;
}

export function subscribeAuth(listener: (session: KriptaSession | null, ready: boolean) => void) {
  listeners.add(listener);
  listener(currentSession, initialized);
  void initializeAuth();
  return () => { listeners.delete(listener); };
}

export function getSession() {
  return currentSession;
}

function authError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (normalized.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (normalized.includes('password should be')) return 'A senha precisa ter no mínimo 8 caracteres.';
  if (normalized.includes('provider is not enabled')) return 'O login com Google ainda não está habilitado no Supabase.';
  if (normalized.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  return message || 'Não foi possível concluir a autenticação.';
}

function setPersistence(remember: boolean) {
  rememberSession = remember;
  localStorage.setItem('kripta.remember', String(remember));
}

export async function login(email: string, password: string, remember: boolean) {
  setPersistence(remember);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authError(error.message));
  currentSession = mapSession(data.session);
  initialized = true;
  notify();
  return currentSession;
}

export async function register(name: string, email: string, password: string) {
  setPersistence(true);
  const username = slug(name);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/app`,
      data: { full_name: name, username, avatar_url: '/assets/fotodeperfil.png' },
    },
  });
  if (error) throw new Error(authError(error.message));
  currentSession = mapSession(data.session);
  initialized = true;
  notify();
  return { session: currentSession, requiresConfirmation: Boolean(data.user && !data.session) };
}

export async function googleSignIn() {
  setPersistence(true);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/app` },
  });
  if (error) throw new Error(authError(error.message));
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw new Error(authError(error.message));
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authError(error.message));
  currentSession = null;
  localStorage.removeItem('kripta.remember');
  notify();
}

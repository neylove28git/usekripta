import { FormEvent, ReactNode, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { googleSignIn, login, register, requestPasswordReset } from './services/supabase/auth';
import './auth.css';

type Errors = Record<string, string>;

const integrationLogos = [
  ['Binance', '/assets/integrations/binance.png'],
  ['Mercado Bitcoin', '/assets/integrations/mercado_bitcoin.png'],
  ['Coinbase', '/assets/integrations/coinbase.png'],
];

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h6a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2Z"/><path fill="#34a853" d="M12 23c3 0 5.5-1 7.4-2.6l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1V17A11.2 11.2 0 0 0 12 23Z"/><path fill="#fbbc05" d="M5.8 14.1a6.7 6.7 0 0 1 0-4.2V7H2.1a11.1 11.1 0 0 0 0 10l3.7-2.9Z"/><path fill="#ea4335" d="M12 5.3c1.7 0 3.1.6 4.3 1.7l3.2-3.2A10.8 10.8 0 0 0 2.1 7l3.7 2.9c.9-2.7 3.3-4.6 6.2-4.6Z"/></svg>;
}

function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-page">
    <section className="auth-form-side"><div className="auth-form-wrap">{children}</div></section>
    <aside className="auth-message" aria-label="Integrações da Kripta">
      <div><h2>Conecte sua conta<br/>e deixe o Kripta<br/>trabalhar</h2><div className="auth-logos">{integrationLogos.map(([name, src], index) => <span className={`auth-logo auth-logo-${index}`} key={name}><img src={src} alt={name}/></span>)}</div></div>
    </aside>
  </main>;
}

function AuthField({ label, name, value, onChange, error, type = 'text', autoComplete }: { label: string; name: string; value: string; onChange: (value: string) => void; error?: string; type?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return <label className="auth-field"><span>{label}</span><div className={error ? 'auth-input invalid' : 'auth-input'}><input name={name} type={password && visible ? 'text' : type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={name === 'email' ? 'seu@email.com' : ''} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined}/>{password && <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>{visible ? <EyeOff/> : <Eye/>}</button>}</div>{error && <small id={`${name}-error`}>{error}</small>}</label>;
}

function AuthModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="auth-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="auth-modal-close" onClick={onClose} aria-label="Fechar"><X/></button><h3 id="auth-modal-title">{title}</h3>{children}</section></div>;
}

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Errors>({}); const [busy, setBusy] = useState(false); const [modal, setModal] = useState(false); const [sent, setSent] = useState(false); const [resetEmail, setResetEmail] = useState(''); const [resetBusy, setResetBusy] = useState(false);
  const validate = () => { const next: Errors = {}; if (!validEmail(email)) next.email = 'Digite um e-mail válido.'; if (password.length < 8) next.password = 'A senha precisa ter no mínimo 8 caracteres.'; setErrors(next); return next; };
  const submit = async (event: FormEvent) => { event.preventDefault(); const next = validate(); if (Object.keys(next).length) { document.querySelector<HTMLInputElement>(`[name="${Object.keys(next)[0]}"]`)?.focus(); return; } setBusy(true); try { await login(email, password, remember); navigate('/app'); } catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível entrar.' }); } finally { setBusy(false); } };
  const google = async () => { setBusy(true); setErrors({}); try { await googleSignIn(); } catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível entrar com o Google.' }); setBusy(false); } };
  const resetPassword = async () => { const target = resetEmail || email; if (!validEmail(target)) { setErrors({ reset: 'Digite um e-mail válido.' }); return; } setResetBusy(true); setErrors({}); try { await requestPasswordReset(target); setSent(true); } catch (error) { setErrors({ reset: error instanceof Error ? error.message : 'Não foi possível enviar o link.' }); } finally { setResetBusy(false); } };
  return <AuthLayout><Link to="/" className="auth-brand"><img src="/assets/logo-dark.png" alt="Kripta"/></Link><div className="auth-heading"><h1>Entrar</h1><p>Entre com seus dados para acessar sua conta.</p></div><form onSubmit={submit} noValidate>
    <AuthField label="E-mail" name="email" type="email" value={email} onChange={(value) => { setEmail(value); if (errors.email) setErrors({...errors, email: ''}); }} error={errors.email} autoComplete="email"/>
    <AuthField label="Senha" name="password" type="password" value={password} onChange={(value) => { setPassword(value); if (errors.password) setErrors({...errors, password: ''}); }} error={errors.password} autoComplete="current-password"/>
    <div className="auth-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/> <span>Lembrar de mim</span></label><button type="button" onClick={() => setModal(true)}>Esqueci a senha</button></div>
    {errors.form && <p className="auth-form-error" role="alert">{errors.form}</p>}<button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner"/> : 'Entrar'}</button>
    <div className="auth-divider"><span>ou continue com</span></div><button type="button" className="auth-google" onClick={google} disabled={busy}><GoogleIcon/>Entrar com Google</button><p className="auth-switch">Novo por aqui? <Link to="/cadastro">Criar conta</Link></p>
  </form>{modal && <AuthModal title="Recuperar senha" onClose={() => setModal(false)}>{sent ? <p>Enviamos um link para seu e-mail.</p> : <><p>Informe seu e-mail para receber o link de recuperação.</p><input className="modal-email" type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder="seu@email.com"/>{errors.reset && <p className="auth-form-error" role="alert">{errors.reset}</p>}<button className="auth-submit" onClick={resetPassword} disabled={resetBusy}>{resetBusy ? <LoaderCircle className="auth-spinner"/> : 'Enviar link'}</button></>}</AuthModal>}</AuthLayout>;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false }); const [errors, setErrors] = useState<Errors>({}); const [busy, setBusy] = useState(false); const [legal, setLegal] = useState<'terms'|'privacy'|null>(null);
  const strength = form.password.length < 8 ? 'fraca' : /[A-Z]/.test(form.password) && /\d/.test(form.password) && form.password.length >= 12 ? 'forte' : 'média';
  const set = (key: string, value: string | boolean) => setForm((current) => ({...current, [key]: value}));
  const submit = async (event: FormEvent) => { event.preventDefault(); const next: Errors = {}; if (form.name.trim().length < 2) next.name = 'Informe um nome com pelo menos 2 caracteres.'; if (!validEmail(form.email)) next.email = 'Digite um e-mail válido.'; if (form.password.length < 8) next.password = 'Use no mínimo 8 caracteres.'; if (form.confirm !== form.password) next.confirm = 'As senhas não coincidem.'; if (!form.terms) next.terms = 'Você precisa aceitar os termos.'; setErrors(next); if (Object.keys(next).length) return; setBusy(true); try { await register(form.name.trim(), form.email, form.password); navigate('/app'); } catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível criar a conta.' }); } finally { setBusy(false); } };
  const google = async () => { setBusy(true); setErrors({}); try { await googleSignIn(); } catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Não foi possível cadastrar com o Google.' }); setBusy(false); } };
  return <AuthLayout><Link to="/" className="auth-brand"><img src="/assets/logo-dark.png" alt="Kripta"/></Link><div className="auth-heading"><h1>Criar conta</h1><p>Crie sua conta para começar a usar a Kripta.</p></div><form onSubmit={submit} noValidate className="register-form">
    <AuthField label="Nome" name="name" value={form.name} onChange={(value) => set('name', value)} error={errors.name} autoComplete="name"/><AuthField label="E-mail" name="email" type="email" value={form.email} onChange={(value) => set('email', value)} error={errors.email} autoComplete="email"/><AuthField label="Senha" name="password" type="password" value={form.password} onChange={(value) => set('password', value)} error={errors.password} autoComplete="new-password"/>
    {form.password && <div className={`password-strength ${strength}`}><span/><span/><span/><small>Senha {strength}</small></div>}<AuthField label="Confirmar senha" name="confirm" type="password" value={form.confirm} onChange={(value) => set('confirm', value)} error={errors.confirm} autoComplete="new-password"/>
    <label className="terms-check"><input type="checkbox" checked={form.terms} onChange={(event) => set('terms', event.target.checked)}/><span>Li e aceito os <button type="button" onClick={() => setLegal('terms')}>Termos de Uso</button> e a <button type="button" onClick={() => setLegal('privacy')}>Política de Privacidade</button></span></label>{errors.terms && <small className="terms-error">{errors.terms}</small>}
    {errors.form && <p className="auth-form-error" role="alert">{errors.form}</p>}<button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner"/> : 'Criar conta'}</button><div className="auth-divider"><span>ou continue com</span></div><button type="button" className="auth-google" onClick={google} disabled={busy}><GoogleIcon/>Cadastrar com Google</button><p className="auth-switch">Já tem conta? <Link to="/login">Entrar</Link></p>
  </form>{legal && <AuthModal title={legal === 'terms' ? 'Termos de Uso' : 'Política de Privacidade'} onClose={() => setLegal(null)}><p>Este é um texto demonstrativo do frontend da Kripta. A versão jurídica definitiva será publicada antes do lançamento comercial.</p></AuthModal>}</AuthLayout>;
}

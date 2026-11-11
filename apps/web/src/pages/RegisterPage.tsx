import { Timer as TimerIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function RegisterPage() {
  const { user, loading, register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/timer" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(name, email, password);
      navigate('/onboarding');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar sua conta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      navigate('/onboarding');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível continuar com Google.',
      );
      setGoogleSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <TimerIcon weight="fill" size={22} className="text-accent" />
          <span className="font-heading text-lg tracking-tight">Pomofoca</span>
        </div>

        <h1 className="mb-2 text-2xl">Crie sua conta</h1>
        <p className="mb-8 text-sm text-muted">
          Grátis pra sempre — leva menos de um minuto.
        </p>

        <GoogleSignInButton onCredential={handleGoogleCredential} onError={setError} />
        {googleSubmitting && (
          <p className="mt-2 text-center text-xs text-muted">Criando conta…</p>
        )}

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-divider" />
          ou crie com e-mail
          <div className="h-px flex-1 bg-divider" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className="mt-1 text-[11px] text-muted">Mínimo de 8 caracteres.</p>
          </div>

          {error && <p className="text-sm text-cta">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
          >
            {submitting ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Já tem conta?{' '}
          <Link to="/login" className="text-accent">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

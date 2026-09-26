import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { Mascot } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = mode === 'login';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Mascot className="mb-4 size-20" />
          <h1 className="text-3xl font-black">{isLogin ? '¡Hola de nuevo!' : 'Crea tu cuenta'}</h1>
          <p className="mt-2 text-wolf">
            {isLogin ? 'Sigue convirtiendo tus libros en texto.' : 'Escanea libros con tu cámara en segundos.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {!isLogin && (
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Tu nombre" />
            </Field>
          )}
          <Field label="Correo electrónico">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="tucorreo@ejemplo.com" />
          </Field>
          <Field label="Contraseña" hint={!isLogin ? 'Mínimo 8 caracteres.' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={isLogin ? 1 : 8}
              placeholder="••••••••"
            />
          </Field>

          {error && <p className="rounded-2xl bg-cardinal-light px-4 py-3 text-sm font-bold text-cardinal-dark">{error}</p>}

          <Button type="submit" block size="lg" loading={loading}>
            {isLogin ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="mt-6 text-center text-wolf">
          {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <Link to={isLogin ? '/registro' : '/login'} className="font-extrabold uppercase text-macaw hover:text-macaw-dark">
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </Link>
        </p>
      </div>
    </div>
  );
}

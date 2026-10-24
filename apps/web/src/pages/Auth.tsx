import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { BookOpen, ChevronDown } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { Logo } from '../components/Logo';
import { Button, Field, Input } from '../components/ui';
import './Auth.css';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const isLogin = mode === 'login';

  useEffect(() => {
    if (!curtainOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCurtainOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [curtainOpen]);

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
    <main className={`auth-shell${isLogin ? '' : ' is-register'}`}>
      <div className="auth-layout">
        <section className="auth-editorial" aria-label="Biblioteca Pública del Estado Trujillo">
          <div className="auth-editorial-lines" aria-hidden="true" />
          <span className="auth-editorial-brand">BiblioTru</span>
          <div className="auth-editorial-copy">
            <h2>Leer.<br />Guardar.<br /><span>Volver.</span></h2>
            <p>Un espacio para las páginas que no quieres perder.</p>
          </div>
          <p className="auth-editorial-footer">BIBLIOTECA PÚBLICA DEL ESTADO TRUJILLO <span>·</span> TU ARCHIVO DE LECTURA</p>
        </section>

        <div className="auth-mobile-spacer" aria-hidden="true" />
        <section className="auth-form-area" aria-label={isLogin ? 'Iniciar sesión' : 'Crear cuenta'}>
          <div className="auth-form-wrap">
            <Logo className="auth-brand" />
            <div className="auth-heading">
              <h1>{isLogin ? 'Tu biblioteca te espera.' : 'Crea tu cuenta.'}</h1>
              <p>{isLogin ? 'Inicia sesión y sigue donde quedaste.' : 'Guarda y encuentra tus lecturas en BiblioTru.'}</p>
            </div>

            <form onSubmit={submit} className="auth-form">
              {!isLogin && (
                <Field label="Nombre">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Tu nombre" />
                </Field>
              )}
              <Field label="Correo electrónico">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="tucorreo@ejemplo.com" />
              </Field>
              <Field label="Contraseña" hint={!isLogin ? 'Mínimo 8 caracteres.' : undefined}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={isLogin ? 1 : 8} placeholder="••••••••" />
              </Field>
              {error && <p role="alert" className="auth-error">{error}</p>}
              <Button type="submit" block size="lg" loading={loading} className="auth-submit">
                {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
              </Button>
            </form>

            <p className="auth-switch">
              {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
              <Link to={isLogin ? '/registro' : '/login'}>{isLogin ? 'Crear cuenta' : 'Iniciar sesión'}</Link>
            </p>
          </div>
        </section>
      </div>

      <aside className={`auth-curtain${curtainOpen ? ' is-open' : ''}`} aria-label="Acerca de BiblioTru">
        <button
          type="button"
          className="auth-curtain-tab"
          aria-controls="auth-curtain-content"
          aria-expanded={curtainOpen}
          aria-label={curtainOpen ? 'Cerrar información de BiblioTru' : 'Descubrir BiblioTru'}
          onClick={() => setCurtainOpen((open) => !open)}
        >
          <span className="auth-curtain-page" aria-hidden="true"><i /><i /><i /></span>
          <span className="auth-curtain-seal" aria-hidden="true"><BookOpen size={16} strokeWidth={2.5} /></span>
          <span className="auth-curtain-heading">BiblioTru</span>
          <span className="auth-curtain-subheading">Biblioteca Pública del Estado Trujillo</span>
          <span className="auth-curtain-invite">{curtainOpen ? 'Toca para cerrar' : 'Toca para explorar'} <ChevronDown size={15} aria-hidden="true" /></span>
        </button>
        <div id="auth-curtain-content" className="auth-curtain-content" inert={!curtainOpen}>
          <div className="auth-curtain-rule" aria-hidden="true" />
          <h2>Tus lecturas tienen un lugar.</h2>
          <p>Escanea libros y documentos, encuentra palabras en sus páginas y retoma la lectura cuando quieras.</p>
          <div className="auth-curtain-features" aria-label="Funciones principales">
            <span>Escanea</span><span>Encuentra</span><span>Lee</span>
          </div>
        </div>
      </aside>
    </main>
  );
}

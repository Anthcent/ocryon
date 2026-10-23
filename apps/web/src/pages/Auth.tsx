import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BookOpenText, ScanLine, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/feedback';
import { Logo, Mascot } from '../components/Logo';
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
    <main className="auth-shell min-h-dvh text-eel">
      <div className="auth-layout mx-auto grid min-h-dvh w-full max-w-[1440px] lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.85fr)]">
        <section className="auth-story relative flex flex-col overflow-hidden px-6 pb-5 pt-7 sm:px-10 lg:min-h-dvh lg:px-12 lg:py-10" aria-label="Descubre Ocryon">
          <Logo className="relative z-10 [&_span]:text-eel" />
          <div className="auth-story-body relative z-10 mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center lg:py-12">
            <div className="auth-copy mt-7 lg:mt-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-feather-dark/20 bg-white/85 px-3 py-1.5 text-xs font-extrabold text-[#376900] sm:text-sm">
                <Sparkles className="size-4" aria-hidden="true" /> Tu biblioteca, en tus manos
              </span>
              <h2 className="mt-4 max-w-[12ch] text-[clamp(2rem,4vw,4.25rem)] font-black leading-[1.07] tracking-[-0.03em] text-eel [text-wrap:balance]">
                De la página al mundo de las ideas.
              </h2>
              <p className="mt-3 max-w-[38ch] text-sm font-semibold leading-relaxed text-eel/80 sm:text-base lg:mt-5 lg:text-lg">
                Escanea tus libros, encuentra cada palabra y vuelve a lo que importa.
              </p>
            </div>

            <div className="auth-art relative mt-7 hidden h-[330px] w-full sm:block lg:mt-12 lg:h-[390px]" aria-hidden="true">
              <div className="auth-art-glow" />
              <div className="auth-page auth-page-source">
                <span className="auth-page-top"><BookOpenText size={19} /> PÁGINA 024</span>
                <span className="auth-page-title">Un libro por descubrir</span>
                <span className="auth-page-lines"><i /><i /><i /><i /><i /></span>
                <span className="auth-scan-line" />
              </div>
              <div className="auth-connector"><ScanLine size={22} /><span>ESCANEANDO</span><ArrowRight size={17} /></div>
              <div className="auth-page auth-page-result">
                <span className="auth-page-top"><Sparkles size={18} /> TEXTO LISTO</span>
                <span className="auth-result-title">Tu lectura, siempre cerca.</span>
                <span className="auth-result-text">Cada página se convierte en texto que puedes buscar, leer y guardar.</span>
                <span className="auth-result-tag">Listo para explorar <ArrowRight size={14} /></span>
              </div>
              <Mascot className="auth-art-mascot absolute bottom-2 left-[8%] size-16 -rotate-12 shadow-lg lg:size-20" />
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-bold text-eel/65 sm:hidden">
              <ScanLine className="size-4 text-feather-dark" aria-hidden="true" /> Escanea · Busca · Redescubre
            </div>
          </div>
          <p className="relative z-10 hidden text-xs font-bold text-eel/60 lg:block">Tus libros y documentos, en un solo lugar.</p>
        </section>

        <section className="auth-form-area flex items-center justify-center px-6 py-9 sm:px-10 lg:px-12 lg:py-12" aria-label={isLogin ? 'Iniciar sesión' : 'Crear cuenta'}>
          <div className="auth-form-wrap w-full max-w-[420px]">
            <div className="mb-8">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border-2 border-feather-dark bg-feather-light lg:mb-7">
                <Mascot className="size-10" />
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{isLogin ? '¡Hola de nuevo!' : 'Crea tu cuenta'}</h1>
              <p className="mt-2 text-base font-semibold text-wolf">
                {isLogin ? 'Tu próxima lectura te está esperando.' : 'Empieza a guardar lo que lees.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
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

              {error && <p role="alert" className="rounded-2xl bg-cardinal-light px-4 py-3 text-sm font-bold text-cardinal-dark">{error}</p>}

              <Button type="submit" block size="lg" loading={loading}>
                {isLogin ? 'Entrar' : 'Crear cuenta'}
              </Button>
            </form>

            <p className="mt-7 text-center text-wolf">
              {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
              <Link to={isLogin ? '/registro' : '/login'} className="font-extrabold uppercase text-[#08618c] hover:text-macaw-dark">
                {isLogin ? 'Regístrate' : 'Inicia sesión'}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

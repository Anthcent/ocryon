import { CircleCheck, ExternalLink, KeyRound, LogOut, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { ENGINES, LANGUAGES } from '../lib/constants';
import type { Engine, KeyStatus } from '../lib/types';
import { useSettings } from '../settings/SettingsContext';

function Section({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-macaw-light text-macaw-dark [&>svg]:size-6">{icon}</div>
        <div>
          <h2 className="text-lg font-black">{title}</h2>
          <p className="text-sm text-wolf">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { settings, setSettings } = useSettings();
  const { toast } = useFeedback();

  const update = async (patch: Parameters<typeof api.settings.update>[0], message = 'Ajustes guardados') => {
    try {
      setSettings(await api.settings.update(patch));
      toast(message);
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Ajustes" subtitle="Configura los motores de OCR, tus preferencias y tu cuenta." />

      <Section icon={<KeyRound />} title="API keys" subtitle="Se guardan cifradas en el servidor y nunca se muestran completas.">
        <div className="space-y-6">
          <ApiKeyEditor
            provider="ocrspace"
            name="OCR.space"
            status={settings.keys.ocrspace}
            help="https://ocr.space/ocrapi/freekey"
            helpLabel="Obtener una clave gratis"
            onSave={(key) => update({ ocrspaceKey: key }, key ? 'Clave de OCR.space guardada' : 'Clave eliminada')}
          />
          <ApiKeyEditor
            provider="gemini"
            name="Gemini"
            status={settings.keys.gemini}
            help="https://aistudio.google.com/apikey"
            helpLabel="Crear clave en Google AI Studio"
            onSave={(key) => update({ geminiKey: key }, key ? 'Clave de Gemini guardada' : 'Clave eliminada')}
          />
          <Field label="Modelo de Gemini" hint="Se usa para el OCR con Gemini y para el análisis con IA.">
            <ModelInput value={settings.geminiModel} onSave={(geminiModel) => update({ geminiModel })} />
          </Field>
        </div>
      </Section>

      <Section icon={<SlidersHorizontal />} title="Preferencias de escaneo" subtitle="Valores predeterminados al abrir el escáner.">
        <div className="space-y-5">
          <Field label="Motor predeterminado">
            <Segmented<Engine>
              value={settings.defaultEngine}
              onChange={(defaultEngine) => update({ defaultEngine })}
              options={(Object.keys(ENGINES) as Engine[]).map((e) => ({ value: e, label: ENGINES[e].label }))}
            />
          </Field>
          <Field label="Idioma predeterminado">
            <Select value={settings.ocrLanguage} onChange={(e) => update({ ocrLanguage: e.target.value })}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-swan p-4">
            <div>
              <div className="font-extrabold">Escanear al tomar la foto</div>
              <p className="text-sm text-wolf">Si está apagado, las fotos se acumulan y las escaneas cuando quieras.</p>
            </div>
            <Toggle checked={settings.autoScan} onChange={(autoScan) => update({ autoScan })} label="Escanear al tomar la foto" />
          </div>
        </div>
      </Section>

      <Section icon={<ShieldCheck />} title="Seguridad" subtitle="Cambia tu contraseña.">
        <ChangePassword />
      </Section>

      <Section icon={<UserRound />} title="Cuenta" subtitle={user?.email ?? ''}>
        <Button variant="plain" icon={<LogOut className="size-5" />} onClick={logout}>
          Cerrar sesión
        </Button>
      </Section>
    </div>
  );
}

function ApiKeyEditor({
  provider,
  name,
  status,
  help,
  helpLabel,
  onSave,
}: {
  provider: 'ocrspace' | 'gemini';
  name: string;
  status: KeyStatus;
  help: string;
  helpLabel: string;
  onSave: (key: string | null) => Promise<boolean>;
}) {
  const { toast } = useFeedback();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (await onSave(value.trim())) setValue('');
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.settings.test(provider);
      toast(`${name} funciona correctamente (${r.ms} ms)`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold">{name}</span>
        {status.source === 'user' && (
          <Badge tone="green">
            <CircleCheck className="size-3" /> {status.masked}
          </Badge>
        )}
        {status.source === 'server' && <Badge tone="blue">Clave del servidor</Badge>}
        {status.source === 'none' && <Badge tone="yellow">Sin configurar</Badge>}
        <a href={help} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-macaw">
          {helpLabel} <ExternalLink className="size-3.5" />
        </a>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.source === 'user' ? 'Escribe una nueva clave para reemplazarla' : 'Pega aquí tu API key'}
          autoComplete="off"
          aria-label={`API key de ${name}`}
          className="flex-1"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={value.trim().length < 8} loading={saving}>
            Guardar
          </Button>
          <Button variant="ghost" disabled={!status.configured} loading={testing} onClick={test}>
            Probar
          </Button>
          {status.source === 'user' && (
            <Button variant="plain" aria-label={`Eliminar clave de ${name}`} onClick={() => onSave(null)} className="px-3">
              <Trash2 className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function ModelInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [model, setModel] = useState(value);
  return (
    <div className="flex gap-2">
      <Input value={model} onChange={(e) => setModel(e.target.value)} list="gemini-models" className="flex-1" />
      <datalist id="gemini-models">
        <option value="gemini-2.5-flash" />
        <option value="gemini-2.5-pro" />
        <option value="gemini-2.5-flash-lite" />
      </datalist>
      <Button variant="ghost" disabled={!model.trim() || model === value} onClick={() => onSave(model.trim())}>
        Guardar
      </Button>
    </div>
  );
}

function ChangePassword() {
  const { toast } = useFeedback();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Contraseña actualizada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Contraseña actual">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" loading={saving}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

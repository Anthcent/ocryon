import clsx from 'clsx';
import { ArrowLeft, Camera, ChevronDown, ImagePlus, PencilLine, Plus, ScanText, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { LessonProgress } from '../components/ActionTile';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Input, ProgressBar, Segmented, Toggle } from '../components/ui';
import { DocFieldsForm, TemplateModal, useDocTemplates } from '../documents/shared';
import { api } from '../lib/api';
import { ENGINES } from '../lib/constants';
import type { DocTemplate } from '../lib/doc-templates';
import { extractFields } from '../lib/extract';
import { prepareImage } from '../lib/image';
import { runOcr } from '../lib/ocr-run';
import type { DocField, Engine } from '../lib/types';
import { useObjectUrl } from '../scan/useObjectUrl';
import { useSettings } from '../settings/SettingsContext';

type Step = 'tipo' | 'fotos' | 'leyendo' | 'formulario';
const STEP_INDEX: Record<Step, number> = { tipo: 0, fotos: 1, leyendo: 2, formulario: 3 };

interface Photo {
  id: string;
  blob: Blob;
}

/** Título por defecto: el tipo más el dato más identificativo que se haya detectado. */
function defaultTitle(template: DocTemplate, fields: DocField[]) {
  const pick = (types: string[]) => fields.find((f) => types.includes(f.type) && f.value.trim())?.value.trim();
  const who = pick(['text']);
  const id = fields.find((f) => f.key === 'numero' && f.value.trim())?.value.trim() ?? pick(['id']);
  const detail = [id, who].filter(Boolean).join(' · ');
  return (detail ? `${template.name} ${detail}` : `${template.name} ${new Date().toLocaleDateString('es')}`).slice(0, 120);
}

export function DocumentNewPage() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const { settings } = useSettings();
  const { templates, reload } = useDocTemplates();
  const [step, setStep] = useState<Step>('tipo');
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [engine, setEngine] = useState<Engine>(settings.defaultEngine);
  const geminiReady = settings.keys.gemini.configured;
  const [useAi, setUseAi] = useState(geminiReady);
  const [progress, setProgress] = useState({ value: 0, label: '' });
  const [fields, setFields] = useState<DocField[]>([]);
  const [detected, setDetected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<'ai' | 'rules' | 'manual'>('manual');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseTemplate = (t: DocTemplate) => {
    setTemplate(t);
    setStep('fotos');
  };

  const addFiles = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (list && files.length < list.length) toast('Algunos archivos no eran imágenes y se omitieron', 'info');
    setPhotos((p) => [...p, ...files.map((blob) => ({ id: crypto.randomUUID(), blob }))]);
  };

  const emptyFields = (t: DocTemplate): DocField[] => t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, value: '' }));

  const fillManually = () => {
    if (!template) return;
    const empty = emptyFields(template);
    setFields(empty);
    setDetected(new Set());
    setMethod('manual');
    setText('');
    setTitle(template.name);
    setStep('formulario');
  };

  const read = async () => {
    if (!template || photos.length === 0) return;
    setStep('leyendo');
    const pieces: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const prefix = photos.length > 1 ? `Página ${i + 1} de ${photos.length} · ` : '';
        const report = (value: number, label: string) => setProgress({ value: ((i + value) / photos.length) * (useAi ? 85 : 95), label: prefix + label });
        report(0, 'Preparando imagen…');
        const image = await prepareImage(photos[i].blob);
        pieces.push((await runOcr(image, engine, settings.ocrLanguage, report)).trim());
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
      setStep('fotos');
      return;
    }
    const fullText = pieces.filter(Boolean).join('\n\n');
    let values: Record<string, string> | null = null;
    let how: 'ai' | 'rules' = 'rules';
    if (useAi && geminiReady && fullText) {
      setProgress({ value: 90, label: 'La IA está completando el formulario…' });
      try {
        values = (await api.documents.extract(template.fields.map(({ key, label, type }) => ({ key, label, type })), fullText, template.name)).values;
        how = 'ai';
      } catch (err) {
        toast(`${errorMessage(err)}. Se usó la detección del dispositivo.`, 'info');
      }
    }
    values ??= extractFields(fullText, template.fields);
    const filled = emptyFields(template).map((f) => ({ ...f, value: values[f.key]?.trim() ?? '' }));
    setProgress({ value: 100, label: 'Listo' });
    setFields(filled);
    setDetected(new Set(filled.filter((f) => f.value).map((f) => f.key)));
    setMethod(how);
    setText(fullText);
    setTitle(defaultTitle(template, filled));
    setStep('formulario');
    if (!fullText) toast('No se encontró texto en las fotos: completa el formulario a mano', 'info');
  };

  const save = async () => {
    if (!template) return;
    if (!title.trim()) return toast('Ponle un título al documento', 'error');
    setSaving(true);
    try {
      const { document } = await api.documents.create({
        templateKey: template.key,
        templateName: template.name,
        title: title.trim(),
        fields,
        text,
        engine: method === 'manual' ? 'manual' : engine,
        method,
      });
      toast('Documento guardado');
      navigate(`/documentos/${document.id}`, { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setSaving(false);
    }
  };

  const filledCount = fields.filter((f) => f.value.trim()).length;

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => (step === 'tipo' ? navigate('/documentos') : setStep(step === 'formulario' ? 'fotos' : 'tipo'))}
          disabled={step === 'leyendo'}
          className="rounded-xl p-2 text-wolf hover:bg-polar disabled:opacity-40"
        >
          <ArrowLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <LessonProgress value={((STEP_INDEX[step] + 1) / 4) * 100} label={`Paso ${Math.min(STEP_INDEX[step] + 1, 3)} de 3`} />
        </div>
      </div>

      {step === 'tipo' && (
        <section>
          <h1 className="mb-1 text-2xl font-black sm:text-3xl">¿Qué documento vas a escanear?</h1>
          <p className="mb-5 font-bold text-wolf">Elige el tipo para saber qué datos buscar.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTemplate(t)}
                className="flex flex-col items-start rounded-3xl border-2 border-b-[5px] border-swan bg-white p-4 text-left transition hover:border-cardinal hover:bg-cardinal-light/40 active:translate-y-[2px] active:border-b-2"
              >
                <span className="mb-2 text-4xl" aria-hidden>
                  {t.emoji}
                </span>
                <span className="font-black leading-tight">{t.name}</span>
                <span className="mt-1 line-clamp-2 text-xs font-bold text-hare">{t.description || `${t.fields.length} campos`}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCreatingType(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-macaw bg-macaw-light/40 p-4 text-macaw-dark transition hover:bg-macaw-light"
            >
              <Plus className="size-8" strokeWidth={3} />
              <span className="font-black">Crear tipo</span>
            </button>
          </div>
        </section>
      )}

      {step === 'fotos' && template && (
        <section className="space-y-4">
          <TemplateBanner template={template} onChange={() => setStep('tipo')} />
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-black">Fotos del documento</h2>
            <div className="grid grid-cols-2 gap-3">
              <BigAction color="feather" icon={<Camera className="size-7" />} label="Tomar foto" onClick={() => cameraInput.current?.click()} />
              <BigAction color="macaw" icon={<ImagePlus className="size-7" />} label="Subir imágenes" onClick={() => fileInput.current?.click()} />
            </div>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Tomar foto del documento"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="Subir imágenes del documento"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {photos.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5" data-testid="doc-photos">
                {photos.map((p, i) => (
                  <Thumb key={p.id} photo={p} index={i} onRemove={() => setPhotos(photos.filter((x) => x.id !== p.id))} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-bold text-hare">Si el documento tiene varias caras u hojas, añade una foto por cada una.</p>
            )}
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="mb-2 text-lg font-black">Leer el texto con</h2>
              <Segmented<Engine>
                value={engine}
                onChange={setEngine}
                options={(Object.keys(ENGINES) as Engine[]).map((e) => ({ value: e, label: ENGINES[e].label }))}
              />
              <p className="mt-1.5 text-sm font-bold text-hare">{ENGINES[engine].description}</p>
            </div>
            <div className={clsx('flex items-center gap-3 rounded-2xl border-2 p-3', useAi && geminiReady ? 'border-beetle bg-beetle-light/50' : 'border-swan')}>
              <Sparkles className="size-6 shrink-0 text-beetle" />
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">Completar el formulario con IA</div>
                <div className="text-sm font-bold text-hare">
                  {geminiReady ? 'Gemini entiende el documento y rellena cada campo.' : 'Configura la clave de Gemini en Ajustes. Sin ella se detecta en tu dispositivo.'}
                </div>
              </div>
              <Toggle checked={useAi && geminiReady} onChange={(v) => setUseAi(v)} label="Completar con IA" />
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="plain" icon={<PencilLine className="size-5" />} onClick={fillManually}>
              Llenar a mano
            </Button>
            <Button size="lg" className="flex-1" icon={<ScanText className="size-6" />} disabled={photos.length === 0} onClick={read}>
              Leer documento
            </Button>
          </div>
        </section>
      )}

      {step === 'leyendo' && (
        <Card className="p-6 text-center sm:p-10">
          <div className="mx-auto mb-4 flex size-20 animate-bounce items-center justify-center rounded-3xl bg-cardinal-light text-5xl" aria-hidden>
            {template?.emoji}
          </div>
          <h2 className="text-2xl font-black">Leyendo tu documento…</h2>
          <p className="mb-5 font-bold text-wolf">{progress.label}</p>
          <ProgressBar value={progress.value} />
          <span className="mt-2 block text-sm font-extrabold text-hare">{Math.round(progress.value)}%</span>
        </Card>
      )}

      {step === 'formulario' && template && (
        <section className="space-y-4">
          <TemplateBanner template={template} />
          <div className="flex flex-wrap items-center gap-2">
            {method === 'ai' && (
              <Badge tone="purple">
                <Sparkles className="size-3.5" /> Detectado con IA
              </Badge>
            )}
            {method === 'rules' && <Badge tone="blue">Detectado en tu dispositivo</Badge>}
            {method !== 'manual' && (
              <span className="text-sm font-extrabold text-wolf" data-testid="detected-count">
                {detected.size} de {fields.length} campos detectados · revisa y corrige si hace falta
              </span>
            )}
          </div>
          <Card className="p-4 sm:p-5">
            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-extrabold">Título del documento</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del documento" maxLength={200} />
            </label>
            <DocFieldsForm fields={fields} onChange={setFields} detected={method === 'manual' ? undefined : detected} />
          </Card>
          {text && (
            <details className="group rounded-2xl border-2 border-swan bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-extrabold">
                Texto leído
                <ChevronDown className="size-5 transition group-open:rotate-180" />
              </summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 pb-4 font-serif text-sm leading-relaxed text-wolf">{text}</pre>
            </details>
          )}
          <div className="sticky bottom-24 z-10 lg:bottom-4">
            <Button size="lg" block loading={saving} onClick={save}>
              Guardar documento ({filledCount}/{fields.length})
            </Button>
          </div>
        </section>
      )}

      <TemplateModal
        open={creatingType}
        onClose={() => setCreatingType(false)}
        onCreated={(t) => {
          void reload();
          chooseTemplate(t);
        }}
      />
    </div>
  );
}

function TemplateBanner({ template, onChange }: { template: DocTemplate; onChange?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border-b-[5px] border-cardinal-dark bg-gradient-to-r from-cardinal to-[#ff6b9a] p-4 text-white">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white/25 text-3xl" aria-hidden>
        {template.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-extrabold uppercase text-white/80">Tipo de documento</div>
        <div className="truncate text-xl font-black">{template.name}</div>
      </div>
      {onChange && (
        <button type="button" onClick={onChange} className="rounded-xl bg-white/20 px-3 py-2 text-xs font-extrabold uppercase hover:bg-white/30">
          Cambiar
        </button>
      )}
    </div>
  );
}

function BigAction({ color, icon, label, onClick }: { color: 'feather' | 'macaw'; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-b-[5px] px-3 py-5 font-black text-white transition hover:brightness-105 active:translate-y-[2px] active:border-b-2',
        color === 'feather' ? 'border-feather-dark bg-feather' : 'border-macaw-dark bg-macaw',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Thumb({ photo, index, onRemove }: { photo: Photo; index: number; onRemove: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border-2 border-swan bg-polar">
      {url && <img src={url} alt={`Foto ${index + 1}`} className="size-full object-cover" />}
      <span className="absolute left-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-eel/80 text-sm font-black text-white">{index + 1}</span>
      <button
        type="button"
        aria-label={`Quitar foto ${index + 1}`}
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-cardinal text-white shadow"
      >
        <X className="size-4" strokeWidth={3} />
      </button>
    </div>
  );
}

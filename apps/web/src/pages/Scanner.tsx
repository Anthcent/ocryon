import { BookOpen, Camera, FileText, ImagePlus, KeyRound, Save, ScanLine, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, Segmented, Select, Textarea, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { ENGINES, GROUP_COLORS, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import type { Engine, Group, GroupColor, ScanEngine } from '../lib/types';
import { CameraCapture } from '../scan/CameraCapture';
import { PageCard, useObjectUrl } from '../scan/PageCard';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

type Mode = 'individual' | 'group';
const NEW_GROUP = 'new';

export function ScannerPage() {
  const session = useScanSession();
  const { settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = params.get('grupo');

  const [mode, setMode] = useState<Mode>(preselected ? 'group' : 'individual');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string>(preselected ?? NEW_GROUP);
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState<GroupColor>('green');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const systemCamera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Al llegar desde «Añadir páginas» de un grupo, ese grupo queda seleccionado.
    if (preselected) {
      setMode('group');
      setGroupId(preselected);
    }
    api.groups
      .list()
      .then((r) => {
        setGroups(r.groups);
        if (!preselected && r.groups.length > 0) setGroupId(String(r.groups[0].id));
      })
      .catch(() => {});
  }, [preselected]);

  const { pages } = session;
  const done = pages.filter((p) => p.status === 'done' && p.text.trim());
  const busy = pages.some((p) => p.status === 'queued' || p.status === 'scanning');
  const scannable = pages.filter((p) => p.status === 'pending' || p.status === 'error');
  const finished = pages.filter((p) => p.status === 'done' || p.status === 'error').length;
  const editing = pages.find((p) => p.id === editingId);

  const engineReady = session.engine === 'tesseract' || settings.keys[session.engine].configured;

  const addFiles = async (files: FileList | Blob[] | null) => {
    if (!files || files.length === 0) return;
    setAdding(true);
    try {
      const failed = await session.addImages(Array.from(files));
      if (failed > 0) {
        toast(`${failed === 1 ? 'Una imagen no se pudo' : `${failed} imágenes no se pudieron`} leer. Usa JPG, PNG o WEBP.`, 'error');
      }
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setAdding(false);
    }
  };

  const onCameraUnavailable = useCallback(
    (reason: string) => {
      setCameraOpen(false);
      toast(reason, 'info');
      systemCamera.current?.click();
    },
    [toast],
  );

  const save = async () => {
    const skipped = pages.length - done.length;
    if (skipped > 0) {
      const ok = await confirm({
        title: '¿Guardar solo lo escaneado?',
        message: `${skipped} ${skipped === 1 ? 'página no tiene' : 'páginas no tienen'} texto todavía y se quedarán aquí para escanearlas después.`,
        confirmLabel: 'Guardar',
      });
      if (!ok) return;
    }
    if (mode === 'group' && groupId === NEW_GROUP && !newTitle.trim()) {
      toast('Ponle un nombre al grupo', 'error');
      return;
    }

    setSaving(true);
    try {
      const items = done.map((p) => ({ text: p.text.trim(), engine: (p.engine ?? 'manual') as ScanEngine, language: session.language }));
      const result = await api.scans.create(
        mode === 'individual'
          ? { items }
          : groupId === NEW_GROUP
            ? { newGroup: { title: newTitle.trim(), color: newColor }, items }
            : { groupId: Number(groupId), items },
      );
      // Tras guardar el texto, las imágenes se descartan.
      session.removeMany(done.map((p) => p.id));
      toast(`¡Guardado! +${items.length} ${items.length === 1 ? 'escaneo' : 'páginas'}`);
      navigate(result.groupId ? `/catalogo/grupo/${result.groupId}` : '/catalogo?vista=individuales');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const destination = useMemo(() => {
    if (mode === 'individual') return 'Cada página se guardará como un escaneo individual.';
    if (groupId === NEW_GROUP) return 'Las páginas se guardarán juntas, en orden, en un grupo nuevo.';
    const g = groups.find((x) => String(x.id) === groupId);
    return g ? `Las páginas se añadirán al final de «${g.title}».` : '';
  }, [mode, groupId, groups]);

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader title="Escanear" subtitle="Toma fotos o sube imágenes de las páginas que quieres convertir en texto." />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Captura */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="flex flex-col items-center gap-2 rounded-3xl border-2 border-b-4 border-feather-dark bg-feather px-4 py-6 text-white transition active:translate-y-[2px] active:border-b-2"
            >
              <Camera className="size-10" strokeWidth={2.25} />
              <span className="text-sm font-extrabold uppercase tracking-wide">Tomar fotos</span>
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-2 rounded-3xl border-2 border-b-4 border-macaw-dark bg-macaw px-4 py-6 text-white transition active:translate-y-[2px] active:border-b-2"
            >
              <ImagePlus className="size-10" strokeWidth={2.25} />
              <span className="text-sm font-extrabold uppercase tracking-wide">Subir imágenes</span>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={systemCamera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {adding && (
            <p className="flex items-center gap-2 text-sm font-bold text-macaw">
              <ScanLine className="size-4 animate-pulse" /> Preparando imágenes…
            </p>
          )}

          {!engineReady && (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-bee bg-bee-light p-4">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-bee-dark" />
              <p className="text-sm font-semibold text-eel">
                Para usar {ENGINES[session.engine].label} necesitas su API key.{' '}
                <Link to="/ajustes" className="font-extrabold text-macaw">
                  Configurarla
                </Link>{' '}
                o usa Tesseract, que funciona sin clave.
              </p>
            </div>
          )}

          {pages.length === 0 ? (
            <Card>
              <EmptyState icon={<BookOpen className="size-10" />} title="Aún no hay páginas">
                Toma una foto por página. Puedes tomar varias seguidas y se quedarán agrupadas aquí hasta que las guardes.
              </EmptyState>
            </Card>
          ) : (
            <>
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between text-sm font-extrabold">
                  <span>
                    {finished} de {pages.length} escaneadas
                  </span>
                  {busy && <Badge tone="blue">Procesando…</Badge>}
                </div>
                <ProgressBar value={(finished / pages.length) * 100} />
              </Card>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {pages.map((page, i) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    index={i}
                    total={pages.length}
                    onScan={() => session.queue([page.id])}
                    onEdit={() => setEditingId(page.id)}
                    onRemove={() => session.remove(page.id)}
                    onMove={(d) => session.move(page.id, d)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Opciones */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="space-y-4 p-4">
            <h2 className="font-black">¿Cómo escanear?</h2>
            <Segmented<Engine>
              value={session.engine}
              onChange={session.setEngine}
              options={(Object.keys(ENGINES) as Engine[]).map((e) => ({ value: e, label: ENGINES[e].label }))}
            />
            <p className="text-sm text-wolf">{ENGINES[session.engine].description}</p>
            <Field label="Idioma del texto">
              <Select value={session.language} onChange={(e) => session.setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-extrabold">
                  <Zap className="size-4 text-bee-dark" /> Escaneo automático
                </div>
                <p className="text-xs text-wolf">Escanea cada foto al tomarla, sin confirmar.</p>
              </div>
              <Toggle checked={session.autoScan} onChange={session.setAutoScan} label="Escaneo automático" />
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="font-black">¿Dónde se guarda?</h2>
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'individual', label: 'Individual', icon: <FileText className="size-4" /> },
                { value: 'group', label: 'Grupo', icon: <BookOpen className="size-4" /> },
              ]}
            />
            {mode === 'group' && (
              <>
                <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Grupo">
                  <option value={NEW_GROUP}>+ Nuevo grupo</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
                {groupId === NEW_GROUP && (
                  <>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ej. Cien años de soledad" maxLength={160} />
                    <div className="flex gap-2">
                      {GROUP_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Color ${c}`}
                          onClick={() => setNewColor(c)}
                          className={`size-8 rounded-full ${GROUP_STYLES[c].bg} ${newColor === c ? 'ring-4 ring-macaw/40 ring-offset-2' : ''}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <p className="text-xs text-wolf">{destination}</p>
          </Card>

          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-swan bg-white p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <div className="mx-auto grid max-w-md grid-cols-2 gap-3 lg:max-w-none lg:grid-cols-1">
              <Button variant="secondary" icon={<ScanLine className="size-5" />} disabled={scannable.length === 0} onClick={() => session.queue()}>
                Escanear {scannable.length > 0 && `(${scannable.length})`}
              </Button>
              <Button icon={<Save className="size-5" />} disabled={done.length === 0 || busy} loading={saving} onClick={save}>
                Guardar {done.length > 0 && `(${done.length})`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {cameraOpen && (
        <CameraCapture onCapture={(blob) => void addFiles([blob])} onClose={() => setCameraOpen(false)} onUnavailable={onCameraUnavailable} />
      )}

      <PageEditor
        key={editingId ?? 'none'}
        page={editing}
        onClose={() => setEditingId(null)}
        onSave={(text) => {
          if (editing) session.updateText(editing.id, text);
          setEditingId(null);
        }}
      />
    </div>
  );
}

function PageEditor({
  page,
  onClose,
  onSave,
}: {
  page: ReturnType<typeof useScanSession>['pages'][number] | undefined;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(page?.text ?? '');
  const url = useObjectUrl(page?.image);
  return (
    <Modal open={Boolean(page)} onClose={onClose} title="Revisar página">
      {url && <img src={url} alt="Página" className="mb-4 max-h-64 w-full rounded-2xl border-2 border-swan object-contain" />}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={page?.status === 'done' ? 'Sin texto' : 'Aún no se escanea. También puedes escribir el texto a mano.'}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="plain" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => onSave(text)} disabled={!text.trim() || page?.status === 'scanning'}>
          Aplicar
        </Button>
      </div>
    </Modal>
  );
}

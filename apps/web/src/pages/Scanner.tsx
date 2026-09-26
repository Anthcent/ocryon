import clsx from 'clsx';
import { BookOpen, Camera, ImagePlus, Save, ScanLine, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Card, ProgressBar } from '../components/ui';
import { api } from '../lib/api';
import type { Engine, Group, GroupColor, ScanEngine } from '../lib/types';
import { CameraCapture } from '../scan/CameraCapture';
import { PageGallery } from '../scan/PageGallery';
import { PageViewer } from '../scan/PageViewer';
import {
  DestinationPanel,
  destinationIcon,
  destinationSummary,
  EnginePanel,
  engineIcon,
  engineSummary,
  NEW_GROUP,
  StepHeader,
  type Mode,
} from '../scan/ScanSetup';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

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
  const [viewer, setViewer] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Los pasos empiezan plegados (muestran lo elegido) para que los botones de captura
  // queden a la vista; se abren al pulsarlos.
  const [openStep, setOpenStep] = useState<1 | 2 | null>(null);
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

  const keysReady: Record<Engine, boolean> = {
    ocrspace: settings.keys.ocrspace.configured,
    gemini: settings.keys.gemini.configured,
    tesseract: true,
  };

  const addFiles = async (files: FileList | Blob[] | null) => {
    // Se copia la lista ya: el FileList del <input> se vacía al reiniciarlo.
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const images = list.filter((f) => !(f instanceof File) || f.type.startsWith('image/') || f.type === '');
    setAdding(true);
    try {
      const { ids, failed } = await session.addImages(images);
      const rejected = failed + (list.length - images.length);
      if (rejected > 0) {
        toast(`${rejected === 1 ? 'Una imagen no se pudo' : `${rejected} imágenes no se pudieron`} leer. Usa JPG, PNG o WEBP.`, 'error');
      } else if (ids.length > 1) {
        toast(`${ids.length} imágenes añadidas`);
      }
      if (ids.length > 0) setOpenStep(null);
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

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: '¿Quitar todas las páginas?',
      message: `Se quitarán las ${pages.length} fotos y su texto sin guardar.`,
      confirmLabel: 'Quitar todas',
      danger: true,
    });
    if (ok) session.removeMany(pages.filter((p) => p.status !== 'scanning').map((p) => p.id));
  };

  const save = async () => {
    if (mode === 'group' && groupId === NEW_GROUP && !newTitle.trim()) {
      setOpenStep(1);
      toast('Ponle un nombre al grupo', 'error');
      return;
    }
    const skipped = pages.length - done.length;
    if (skipped > 0) {
      const ok = await confirm({
        title: '¿Guardar solo lo escaneado?',
        message: `${skipped} ${skipped === 1 ? 'página no tiene' : 'páginas no tienen'} texto todavía y se quedarán aquí para escanearlas después.`,
        confirmLabel: 'Guardar',
      });
      if (!ok) return;
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

  const removePage = (id: string) => {
    session.remove(id);
    if (viewer !== null) {
      const remaining = pages.length - 1;
      if (remaining === 0) setViewer(null);
      else setViewer(Math.min(viewer, remaining - 1));
    }
  };

  const toggle = (step: 1 | 2) => setOpenStep((s) => (s === step ? null : step));

  const destination = { mode, setMode, groups, groupId, setGroupId, newTitle, setNewTitle, newColor, setNewColor };
  const engineOptions = {
    engine: session.engine,
    setEngine: session.setEngine,
    language: session.language,
    setLanguage: session.setLanguage,
    autoScan: session.autoScan,
    setAutoScan: session.setAutoScan,
    keysReady,
  };

  return (
    <div className={clsx(pages.length > 0 && 'pb-28 lg:pb-24')}>
      <div className="mb-5">
        <h1 className="text-2xl font-black sm:text-3xl">Escanear</h1>
        <p className="mt-1 text-wolf">Elige cómo guardar, toma las fotos y conviértelas en texto.</p>
      </div>

      <div className="space-y-4">
        {/* Opciones arriba: dos botones con lo elegido; al pulsar uno se abren sus opciones debajo */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StepHeader
              step={1}
              title="¿Dónde se guarda?"
              shortTitle="¿Dónde?"
              summary={destinationSummary(destination)}
              icon={destinationIcon(mode)}
              open={openStep === 1}
              onToggle={() => toggle(1)}
            />
            <StepHeader
              step={2}
              title="¿Cómo escanear?"
              shortTitle="¿Cómo?"
              summary={engineSummary(engineOptions)}
              icon={engineIcon(session.engine)}
              open={openStep === 2}
              onToggle={() => toggle(2)}
              warning={!keysReady[session.engine]}
            />
          </div>
          {openStep === 1 && <DestinationPanel {...destination} />}
          {openStep === 2 && <EnginePanel {...engineOptions} />}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            'rounded-3xl border-2 border-dashed p-3 transition sm:p-4',
            dragging ? 'border-macaw bg-macaw-light' : 'border-swan',
          )}
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-b-[6px] border-feather-dark bg-feather px-3 py-5 text-white transition active:translate-y-[3px] active:border-b-2 sm:py-7"
            >
              <Camera className="size-10 sm:size-12" strokeWidth={2.25} />
              <span className="text-sm font-extrabold uppercase tracking-wide sm:text-base">Tomar fotos</span>
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-b-[6px] border-macaw-dark bg-macaw px-3 py-5 text-white transition active:translate-y-[3px] active:border-b-2 sm:py-7"
            >
              <ImagePlus className="size-10 sm:size-12" strokeWidth={2.25} />
              <span className="text-sm font-extrabold uppercase tracking-wide sm:text-base">Subir imágenes</span>
            </button>
          </div>
          <p className="mt-3 hidden items-center justify-center gap-2 text-sm font-bold text-hare sm:flex">
            <Upload className="size-4" /> {dragging ? 'Suelta las imágenes aquí' : 'También puedes arrastrar imágenes aquí'}
          </p>
          {adding && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm font-bold text-macaw">
              <ScanLine className="size-4 animate-pulse" /> Preparando imágenes…
            </p>
          )}
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

        {pages.length === 0 ? (
          <Card className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-4 flex size-20 items-center justify-center rounded-3xl bg-polar text-hare">
              <BookOpen className="size-10" />
            </div>
            <h3 className="text-xl font-black">Aún no hay páginas</h3>
            <p className="mt-2 max-w-sm text-wolf">
              Toma una foto por página. Puedes tomar varias seguidas: aparecerán aquí numeradas y podrás revisarlas antes de guardar.
            </p>
          </Card>
        ) : (
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-black">
                Tus páginas
                <span className="rounded-xl bg-macaw-light px-2.5 py-0.5 text-base text-macaw-dark">{pages.length}</span>
              </h2>
              <Button variant="plain" size="sm" icon={<Trash2 className="size-4" />} onClick={clearAll} disabled={pages.every((p) => p.status === 'scanning')}>
                Quitar todas
              </Button>
            </div>
            <PageGallery
              pages={pages}
              onOpen={(id) => setViewer(pages.findIndex((p) => p.id === id))}
              onRemove={removePage}
              onMove={session.move}
              onScan={(id) => session.queue([id])}
              onAdd={() => fileInput.current?.click()}
            />
          </section>
        )}
      </div>

      {/* Barra de acciones fija, siempre a la vista mientras hay páginas */}
      {pages.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t-2 border-swan bg-white/95 backdrop-blur lg:bottom-0 lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
            <div className="flex items-center gap-3 sm:flex-1">
              <span className="shrink-0 text-sm font-extrabold">
                {finished} de {pages.length} escaneadas
              </span>
              <ProgressBar value={(finished / pages.length) * 100} className="h-3" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="secondary" icon={<ScanLine className="hidden size-5 sm:block" />} className="whitespace-nowrap" disabled={scannable.length === 0} onClick={() => session.queue()}>
                Escanear {scannable.length > 0 && `(${scannable.length})`}
              </Button>
              <Button icon={<Save className="hidden size-5 sm:block" />} className="whitespace-nowrap" disabled={done.length === 0 || busy} loading={saving} onClick={save}>
                Guardar {done.length > 0 && `(${done.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onUnavailable={onCameraUnavailable} />}

      {viewer !== null && pages[viewer] && (
        <PageViewer
          pages={pages}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          onSaveText={(id, text) => {
            session.updateText(id, text);
            toast('Texto actualizado');
          }}
          onScan={(id) => session.queue([id])}
          onRotate={session.rotate}
          onRemove={removePage}
        />
      )}
    </div>
  );
}

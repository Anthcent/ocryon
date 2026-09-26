import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Download, FileText, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, PageLoader, Select, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { ENGINE_LABEL, LANGUAGES } from '../lib/constants';
import { downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';

export function ScanDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [scan, setScan] = useState<Scan | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [siblings, setSiblings] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setScan(null);
    api.scans
      .get(id)
      .then(({ scan }) => {
        setScan(scan);
        setTitle(scan.title);
        setText(scan.text);
        if (scan.groupId) {
          api.groups.get(scan.groupId).then((r) => setSiblings(r.scans.map((s) => s.id))).catch(() => {});
        } else setSiblings([]);
      })
      .catch(() => setNotFound(true));
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => {});
  }, [id]);

  if (notFound) {
    return <EmptyState icon={<FileText className="size-10" />} title="Escaneo no encontrado" action={<Link to="/catalogo"><Button>Volver al catálogo</Button></Link>} />;
  }
  if (!scan) return <PageLoader />;

  const dirty = title !== scan.title || text !== scan.text;
  const index = siblings.indexOf(scan.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const save = async () => {
    setSaving(true);
    try {
      const { scan: updated } = await api.scans.update(scan.id, { title, text });
      setScan(updated);
      toast('Cambios guardados');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const moveTo = async (value: string) => {
    try {
      const { scan: updated } = await api.scans.update(scan.id, { groupId: value ? Number(value) : null });
      setScan(updated);
      toast(updated.groupTitle ? `Movido a «${updated.groupTitle}»` : 'Ahora es un escaneo individual');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: '¿Borrar escaneo?', message: 'Se borrará el texto y sus análisis.', confirmLabel: 'Borrar', danger: true }))) return;
    await api.scans.remove(scan.id);
    toast('Escaneo borrado');
    navigate(scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales', { replace: true });
  };

  const language = LANGUAGES.find((l) => l.code === scan.language)?.label ?? scan.language;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales'}
          className="inline-flex min-w-0 items-center gap-1 text-sm font-extrabold uppercase text-hare hover:text-wolf"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="truncate">{scan.groupTitle ?? 'Individuales'}</span>
        </Link>
        {siblings.length > 1 && (
          <div className="flex items-center gap-1">
            <IconButton label="Página anterior" disabled={!prev} onClick={() => prev && navigate(`/escaneo/${prev}`)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <span className="text-sm font-extrabold text-wolf">
              {index + 1} / {siblings.length}
            </span>
            <IconButton label="Página siguiente" disabled={!next} onClick={() => next && navigate(`/escaneo/${next}`)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        )}
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-xl font-black" aria-label="Título" maxLength={200} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="blue">{ENGINE_LABEL[scan.engine]}</Badge>
          <Badge>{language}</Badge>
          <span className="text-sm font-bold text-hare">
            {formatNumber(scan.wordCount)} palabras · {formatDate(scan.createdAt)}
          </span>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} aria-label="Texto escaneado" className="font-medium" />
        <div className="flex flex-wrap gap-2">
          <Button icon={<Save className="size-5" />} disabled={!dirty} loading={saving} onClick={save}>
            Guardar
          </Button>
          <Button
            variant="plain"
            icon={<Copy className="size-5" />}
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              toast('Texto copiado');
            }}
          >
            Copiar
          </Button>
          <Button variant="plain" icon={<Download className="size-5" />} onClick={() => downloadText(`${title || 'escaneo'}.txt`, text)}>
            .txt
          </Button>
          <Button variant="plain" icon={<Trash2 className="size-5" />} onClick={remove} className="hover:text-cardinal">
            Borrar
          </Button>
        </div>
        <Field label="Grupo">
          <Select value={scan.groupId ?? ''} onChange={(e) => moveTo(e.target.value)}>
            <option value="">Ninguno (individual)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <AnalysisPanel key={scan.id} targetType="scan" targetId={scan.id} text={scan.text} />
    </div>
  );
}

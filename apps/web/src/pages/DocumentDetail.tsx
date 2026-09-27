import { ArrowLeft, ChevronDown, Copy, FileJson, FileSpreadsheet, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Input, PageLoader } from '../components/ui';
import { DocFieldsForm, documentsToCsv, downloadFile, useDocTemplates } from '../documents/shared';
import { api } from '../lib/api';
import { ENGINE_LABEL } from '../lib/constants';
import { copyText, formatDate } from '../lib/format';
import type { DocField, SavedDocument } from '../lib/types';

export function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const { templates } = useDocTemplates();
  const [doc, setDoc] = useState<SavedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<DocField[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.documents
      .get(Number(id))
      .then(({ document }) => {
        setDoc(document);
        setTitle(document.title);
        setFields(document.fields);
      })
      .catch((err) => {
        toast(errorMessage(err), 'error');
        navigate('/documentos', { replace: true });
      });
  }, [id, navigate, toast]);

  if (!doc) return <PageLoader />;

  const dirty = title !== doc.title || JSON.stringify(fields) !== JSON.stringify(doc.fields);
  const emoji = templates.find((t) => t.key === doc.templateKey)?.emoji ?? '📄';
  const filled = fields.filter((f) => f.value.trim()).length;

  const save = async () => {
    if (!title.trim()) return toast('El título no puede quedar vacío', 'error');
    setSaving(true);
    try {
      const { document } = await api.documents.update(doc.id, { title: title.trim(), fields });
      setDoc(document);
      setTitle(document.title);
      setFields(document.fields);
      toast('Cambios guardados');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: '¿Borrar este documento?', message: `Se borrará «${doc.title}» y sus datos.`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await api.documents.remove(doc.id);
      toast('Documento borrado');
      navigate('/documentos', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const current = { ...doc, title, fields };
  const copyData = async () => {
    await copyText(fields.map((f) => `${f.label}: ${f.value}`).join('\n'));
    toast('Datos copiados');
  };
  const exportJson = () => {
    const data = { titulo: title, tipo: doc.templateName, ...Object.fromEntries(fields.map((f) => [f.key, f.value])) };
    downloadFile(`${title}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <Link to="/documentos" className="mb-4 inline-flex items-center gap-1.5 text-sm font-extrabold uppercase text-macaw hover:underline">
        <ArrowLeft className="size-4" /> Documentos
      </Link>

      <div className="mb-5 flex items-center gap-4 rounded-3xl border-b-[5px] border-cardinal-dark bg-gradient-to-br from-cardinal via-[#ff6b9a] to-beetle p-4 text-white sm:p-5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-4xl" aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold uppercase text-white/85">{doc.templateName}</div>
          <h1 className="truncate text-xl font-black sm:text-2xl">{doc.title}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-extrabold">
            <span className="rounded-lg bg-white/25 px-2 py-0.5">{formatDate(doc.createdAt)}</span>
            <span className="rounded-lg bg-white/25 px-2 py-0.5">
              {filled}/{fields.length} campos
            </span>
            {doc.engine !== 'manual' && <span className="rounded-lg bg-white/25 px-2 py-0.5">{ENGINE_LABEL[doc.engine] ?? doc.engine}</span>}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="plain" size="sm" icon={<Copy className="size-4" />} onClick={copyData}>
          Copiar datos
        </Button>
        <Button variant="plain" size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={() => downloadFile(`${title}.csv`, documentsToCsv([current]), 'text/csv;charset=utf-8')}>
          CSV
        </Button>
        <Button variant="plain" size="sm" icon={<FileJson className="size-4" />} onClick={exportJson}>
          JSON
        </Button>
        <Button variant="plain" size="sm" className="text-cardinal" icon={<Trash2 className="size-4" />} onClick={remove}>
          Borrar
        </Button>
      </div>

      <Card className="mb-4 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black">Datos del documento</h2>
          {doc.method === 'ai' && (
            <Badge tone="purple">
              <Sparkles className="size-3.5" /> Detectado con IA
            </Badge>
          )}
          {doc.method === 'rules' && <Badge tone="blue">Detectado en tu dispositivo</Badge>}
        </div>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-extrabold">Título del documento</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del documento" maxLength={200} />
        </label>
        <DocFieldsForm fields={fields} onChange={setFields} />
      </Card>

      {doc.text && (
        <details className="group mb-4 rounded-2xl border-2 border-swan bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-extrabold">
            Texto leído
            <ChevronDown className="size-5 transition group-open:rotate-180" />
          </summary>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-4 pb-4 font-serif text-sm leading-relaxed text-wolf">{doc.text}</pre>
        </details>
      )}

      {dirty && (
        <div className="sticky bottom-24 z-10 flex gap-2 lg:bottom-4">
          <Button
            variant="plain"
            onClick={() => {
              setTitle(doc.title);
              setFields(doc.fields);
            }}
          >
            Descartar
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}

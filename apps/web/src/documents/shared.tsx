import clsx from 'clsx';
import { CircleCheck, CircleDashed, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Input, Modal, Select, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { DOC_EMOJIS, FIELD_TYPE_LABEL, fieldKey, PRESET_TEMPLATES, type DocTemplate, type FieldType } from '../lib/doc-templates';
import type { DocField, SavedDocument } from '../lib/types';

/** Tipos de documento disponibles: los de la app más los creados por el usuario. */
export function useDocTemplates() {
  const [custom, setCustom] = useState<DocTemplate[]>([]);
  const reload = useCallback(async () => {
    try {
      const { templates } = await api.documents.templates();
      setCustom(
        templates.map((t) => ({
          key: `custom-${t.id}`,
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          description: `${t.fields.length} ${t.fields.length === 1 ? 'campo' : 'campos'}`,
          fields: t.fields,
          custom: true,
        })),
      );
    } catch {
      // sin conexión: solo los predefinidos
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { templates: [...PRESET_TEMPLATES, ...custom], custom, reload };
}

const INPUT_TYPE: Partial<Record<FieldType, string>> = { date: 'date', email: 'email', phone: 'tel' };

/**
 * Formulario de los datos del documento. Marca en verde los campos que se detectaron
 * automáticamente y en amarillo los que conviene revisar porque quedaron vacíos.
 */
export function DocFieldsForm({
  fields,
  onChange,
  detected,
  readOnly,
}: {
  fields: DocField[];
  onChange?: (fields: DocField[]) => void;
  /** Claves que se rellenaron automáticamente. */
  detected?: Set<string>;
  readOnly?: boolean;
}) {
  const set = (key: string, value: string) => onChange?.(fields.map((f) => (f.key === key ? { ...f, value } : f)));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {fields.map((f) => {
        const auto = detected?.has(f.key) && f.value;
        const empty = !f.value.trim();
        return (
          <label key={f.key} className={clsx('block rounded-2xl border-2 p-3', f.type === 'longtext' && 'md:col-span-2', auto ? 'border-feather/60 bg-feather-light/40' : empty && detected ? 'border-bee/70 bg-bee-light/40' : 'border-swan bg-white')}>
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold">{f.label}</span>
              {detected &&
                (auto ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-feather-dark">
                    <CircleCheck className="size-3.5" /> Detectado
                  </span>
                ) : empty ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-bee-dark">
                    <CircleDashed className="size-3.5" /> Revisar
                  </span>
                ) : null)}
            </span>
            {readOnly ? (
              <span className={clsx('block min-h-6 whitespace-pre-line break-words font-bold', empty && 'text-hare')}>{f.value || '—'}</span>
            ) : f.type === 'longtext' ? (
              <Textarea value={f.value} onChange={(e) => set(f.key, e.target.value)} rows={3} aria-label={f.label} className="bg-white" />
            ) : (
              <Input
                // Una fecha que no está en AAAA-MM-DD se deja como texto para no perderla.
                type={f.type === 'date' && f.value && !/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? 'text' : (INPUT_TYPE[f.type] ?? 'text')}
                inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
                value={f.value}
                onChange={(e) => set(f.key, e.target.value)}
                aria-label={f.label}
                className="bg-white"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** CSV compatible con Excel (separador «;», BOM UTF-8 y comillas cuando hace falta). */
export function documentsToCsv(docs: SavedDocument[]) {
  const columns: { key: string; label: string }[] = [];
  for (const d of docs) for (const f of d.fields) if (!columns.some((c) => c.key === f.key)) columns.push({ key: f.key, label: f.label });
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Título', 'Tipo', 'Fecha de registro', ...columns.map((c) => c.label)];
  const rows = docs.map((d) => [d.title, d.templateName, d.createdAt, ...columns.map((c) => d.fields.find((f) => f.key === c.key)?.value ?? '')]);
  return '﻿' + [header, ...rows].map((r) => r.map((v) => escape(String(v))).join(';')).join('\n');
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Crear un tipo de documento propio con sus campos. */
export function TemplateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: DocTemplate) => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📄');
  const [fields, setFields] = useState<{ label: string; type: FieldType }[]>([{ label: '', type: 'text' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmoji('📄');
    setFields([
      { label: '', type: 'text' },
      { label: '', type: 'date' },
    ]);
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = fields.filter((f) => f.label.trim());
    if (!name.trim()) return toast('Ponle un nombre al tipo de documento', 'error');
    if (clean.length === 0) return toast('Añade al menos un campo', 'error');
    const keys = clean.map((f) => fieldKey(f.label));
    if (new Set(keys).size !== keys.length) return toast('Hay campos con el mismo nombre', 'error');
    setSaving(true);
    try {
      const { template } = await api.documents.createTemplate({
        name: name.trim(),
        emoji,
        fields: clean.map((f, i) => ({ key: keys[i], label: f.label.trim(), type: f.type })),
      });
      onCreated({ key: `custom-${template.id}`, id: template.id, name: template.name, emoji: template.emoji, description: '', fields: template.fields, custom: true });
      toast('Tipo de documento creado');
      onClose();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo tipo de documento" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Orden de compra" aria-label="Nombre del tipo" maxLength={60} autoFocus />
          <div className="flex flex-wrap gap-1">
            {DOC_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                aria-pressed={emoji === em}
                aria-label={`Icono ${em}`}
                className={clsx('size-10 rounded-xl text-xl', emoji === em ? 'bg-macaw-light ring-2 ring-macaw' : 'hover:bg-polar')}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-extrabold">Campos del formulario</div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={f.label}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder={`Campo ${i + 1} (ej. Proveedor)`}
                  aria-label={`Nombre del campo ${i + 1}`}
                  maxLength={60}
                  className="flex-1"
                />
                <Select
                  value={f.type}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldType } : x)))}
                  aria-label={`Tipo del campo ${i + 1}`}
                  className="w-40"
                >
                  {Object.entries(FIELD_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  aria-label={`Quitar campo ${i + 1}`}
                  onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  className="rounded-xl px-2 text-hare hover:bg-cardinal-light hover:text-cardinal"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setFields([...fields, { label: '', type: 'text' }])}>
            Añadir campo
          </Button>
        </div>
        <Button type="submit" block loading={saving}>
          Crear tipo
        </Button>
      </form>
    </Modal>
  );
}

export type FieldType = 'text' | 'number' | 'money' | 'date' | 'id' | 'email' | 'phone' | 'longtext';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Otras formas en que la etiqueta aparece en los documentos (para la extracción sin IA). */
  aliases?: string[];
  /** Si no se encuentra la etiqueta, usar la primera línea del documento (p. ej. el nombre del emisor). */
  firstLine?: boolean;
}

export interface DocTemplate {
  /** «factura», «identidad»… o «custom-12» para los tipos creados por el usuario. */
  key: string;
  name: string;
  emoji: string;
  description: string;
  fields: FieldDef[];
  custom?: boolean;
  id?: number;
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto',
  longtext: 'Texto largo',
  number: 'Número',
  money: 'Importe',
  date: 'Fecha',
  id: 'Código / N.º',
  email: 'Correo',
  phone: 'Teléfono',
};

/** Tipos de documento que vienen con la app. */
export const PRESET_TEMPLATES: DocTemplate[] = [
  {
    key: 'factura',
    name: 'Factura',
    emoji: '🧾',
    description: 'Emisor, número, fecha, importes.',
    fields: [
      { key: 'emisor', label: 'Emisor', type: 'text', aliases: ['razón social', 'vendedor', 'proveedor', 'empresa'], firstLine: true },
      { key: 'ruc_emisor', label: 'RUC / NIF del emisor', type: 'id', aliases: ['ruc', 'nif', 'cif', 'nit', 'rfc', 'cuit'] },
      { key: 'numero', label: 'Número de factura', type: 'id', aliases: ['factura', 'factura n', 'n° factura', 'nro', 'número', 'serie'] },
      { key: 'fecha', label: 'Fecha de emisión', type: 'date', aliases: ['fecha de emisión', 'fecha emisión', 'fecha'] },
      { key: 'cliente', label: 'Cliente', type: 'text', aliases: ['señor(es)', 'señores', 'adquiriente', 'razón social del cliente', 'facturar a'] },
      { key: 'subtotal', label: 'Subtotal', type: 'money', aliases: ['sub total', 'op. gravada', 'base imponible', 'valor venta'] },
      { key: 'impuesto', label: 'Impuesto (IGV / IVA)', type: 'money', aliases: ['igv', 'iva', 'impuesto'] },
      { key: 'total', label: 'Total', type: 'money', aliases: ['importe total', 'total a pagar', 'total'] },
    ],
  },
  {
    key: 'recibo',
    name: 'Boleta / Recibo',
    emoji: '🧾',
    description: 'Comprobantes simples de pago.',
    fields: [
      { key: 'emisor', label: 'Emisor', type: 'text', aliases: ['razón social', 'empresa', 'comercio'], firstLine: true },
      { key: 'numero', label: 'Número', type: 'id', aliases: ['boleta', 'recibo', 'n°', 'nro', 'número', 'ticket'] },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
      { key: 'concepto', label: 'Concepto', type: 'text', aliases: ['concepto', 'descripción', 'por concepto de', 'detalle'] },
      { key: 'total', label: 'Total', type: 'money', aliases: ['importe total', 'total a pagar', 'total', 'importe'] },
    ],
  },
  {
    key: 'identidad',
    name: 'Documento de identidad',
    emoji: '🪪',
    description: 'DNI, cédula o pasaporte.',
    fields: [
      { key: 'nombres', label: 'Nombres', type: 'text', aliases: ['nombres', 'pre nombres', 'prenombres', 'nombre', 'given names'] },
      { key: 'apellidos', label: 'Apellidos', type: 'text', aliases: ['apellidos', 'primer apellido', 'surname'] },
      { key: 'numero', label: 'Número de documento', type: 'id', aliases: ['dni', 'cédula', 'cedula', 'pasaporte', 'documento', 'n°', 'número'] },
      { key: 'nacimiento', label: 'Fecha de nacimiento', type: 'date', aliases: ['fecha de nacimiento', 'nacimiento', 'date of birth'] },
      { key: 'sexo', label: 'Sexo', type: 'text', aliases: ['sexo', 'sex'] },
      { key: 'nacionalidad', label: 'Nacionalidad', type: 'text', aliases: ['nacionalidad', 'nationality'] },
      { key: 'emision', label: 'Fecha de emisión', type: 'date', aliases: ['fecha de emisión', 'emisión', 'expedición', 'date of issue'] },
      { key: 'vencimiento', label: 'Fecha de vencimiento', type: 'date', aliases: ['fecha de caducidad', 'caducidad', 'vencimiento', 'válido hasta', 'date of expiry'] },
    ],
  },
  {
    key: 'contrato',
    name: 'Contrato',
    emoji: '📑',
    description: 'Partes, fechas, montos y plazos.',
    fields: [
      { key: 'titulo', label: 'Tipo de contrato', type: 'text', aliases: ['contrato de', 'contrato'] },
      { key: 'partes', label: 'Partes', type: 'longtext', aliases: ['entre', 'de una parte', 'arrendador', 'arrendatario', 'partes'] },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha', 'a los', 'en la ciudad de'] },
      { key: 'monto', label: 'Monto', type: 'money', aliases: ['monto', 'precio', 'renta', 'importe', 'suma de'] },
      { key: 'vigencia', label: 'Plazo / vigencia', type: 'text', aliases: ['plazo', 'vigencia', 'duración'] },
    ],
  },
  {
    key: 'carta',
    name: 'Carta / Oficio',
    emoji: '📨',
    description: 'Remitente, destinatario y asunto.',
    fields: [
      { key: 'remitente', label: 'Remitente', type: 'text', aliases: ['de', 'remitente', 'atentamente'] },
      { key: 'destinatario', label: 'Destinatario', type: 'text', aliases: ['para', 'señor', 'señora', 'destinatario', 'a'] },
      { key: 'asunto', label: 'Asunto', type: 'text', aliases: ['asunto', 'referencia', 'ref'] },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
    ],
  },
  {
    key: 'generico',
    name: 'Documento general',
    emoji: '📄',
    description: 'Datos comunes de cualquier documento.',
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', aliases: ['título', 'asunto'], firstLine: true },
      { key: 'fecha', label: 'Fecha', type: 'date', aliases: ['fecha'] },
      { key: 'numero', label: 'Número', type: 'id', aliases: ['n°', 'nro', 'número', 'expediente', 'código'] },
      { key: 'monto', label: 'Monto', type: 'money', aliases: ['total', 'monto', 'importe'] },
      { key: 'email', label: 'Correo', type: 'email', aliases: ['correo', 'email', 'e-mail'] },
      { key: 'telefono', label: 'Teléfono', type: 'phone', aliases: ['teléfono', 'telf', 'tel', 'celular', 'móvil'] },
    ],
  },
];

export const DOC_EMOJIS = ['📄', '🧾', '🪪', '📑', '📨', '📦', '🏥', '🎓', '🚗', '🏠', '💼', '🧪'];

/** «Fecha de pago» → «fecha_de_pago» (clave de campo segura). */
export function fieldKey(label: string) {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'campo'
  );
}

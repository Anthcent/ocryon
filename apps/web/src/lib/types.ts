export type Engine = 'ocrspace' | 'gemini' | 'tesseract';
export type ScanEngine = Engine | 'manual';
export type GroupColor = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'yellow';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface KeyStatus {
  configured: boolean;
  source: 'user' | 'server' | 'none';
  masked: string;
}

export interface Settings {
  defaultEngine: Engine;
  ocrLanguage: string;
  autoScan: boolean;
  geminiModel: string;
  keys: { ocrspace: KeyStatus; gemini: KeyStatus };
}

export interface Group {
  id: number;
  title: string;
  description: string;
  author: string;
  category: string;
  color: GroupColor;
  /** Páginas que tiene el libro en total (opcional), para mostrar el avance. */
  totalPages: number | null;
  createdAt: string;
  updatedAt: string;
  scanCount?: number;
  wordCount?: number;
}

export interface Scan {
  id: number;
  groupId: number | null;
  groupTitle?: string | null;
  groupColor?: GroupColor | null;
  title: string;
  text: string;
  engine: ScanEngine;
  language: string;
  position: number;
  wordCount: number;
  /** Número de página impreso detectado en la hoja («23», «xii»…); vacío si no se detectó. */
  pageLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  id: number;
  title: string;
  groupId: number | null;
  groupTitle: string | null;
  groupColor: GroupColor | null;
  groupAuthor: string | null;
  groupCategory: string | null;
  position: number;
  pageLabel: string;
  wordCount: number;
  createdAt: string;
  snippet: string;
}

export interface Stats {
  totals: { scans: number; words: number; individual: number; groups: number };
  streak: number;
  week: { day: string; count: number }[];
  recentGroups: (Pick<Group, 'id' | 'title' | 'color' | 'updatedAt'> & { scanCount: number })[];
}

export interface Analysis<T = unknown> {
  id: number;
  targetType: 'group' | 'scan';
  targetId: number;
  mode: 'online' | 'offline';
  content: T;
  createdAt: string;
}

export interface OnlineAnalysisContent {
  resumen: string;
  temas: string[];
  ideasClave: string[];
  entidades: { nombre: string; tipo: string }[];
  vocabulario: { termino: string; definicion: string }[];
  preguntas: string[];
  tono: string;
  calidadOcr: string;
  truncated?: boolean;
}

/** Datos editables de un grupo (libro). */
export type GroupInput = Pick<Group, 'title' | 'description' | 'author' | 'category' | 'color' | 'totalPages'>;

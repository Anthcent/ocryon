/**
 * Análisis de texto que se ejecuta por completo en el dispositivo, sin conexión.
 * Estadísticas, legibilidad (Fernández Huerta), palabras clave y un resumen extractivo.
 */

const STOPWORDS = new Set(
  `a al algo algunas algunos ante antes aquel aquella aquellas aquellos aqui aquí asi así aun aún bien cada casi como cómo con contra cual cuales cuando cuándo de del desde donde dónde dos el él ella ellas ellos en entre era eran es esa esas ese eso esos esta está estaba estaban estan están estar este esto estos fue fueron ha había habían hace hacia han hasta hay la las le les lo los mas más me mi mis mismo mucho muy nada ni no nos nosotros o otra otras otro otros para pero poco por porque pues que qué quien quién se sea ser si sí sido sin sino sobre su sus tal también tambien tan tanto te tenía tiene tienen todo todos tu tus un una uno unos usted ya yo
  the and of to in is it that was for on are as with his they at be this from have or by one had not but what all were when we there can an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than been who its now my over did down only way find use may long very after words called just where most know get through back much before go good new write our used me man too any day same right look think also around another came come work three word must because does part even place well such here take why things help put years different away again off went old number`.split(
    /\s+/,
  ),
);

export interface OfflineAnalysis {
  version: 1;
  palabras: number;
  palabrasUnicas: number;
  caracteres: number;
  oraciones: number;
  parrafos: number;
  promedioPalabrasPorOracion: number;
  minutosLectura: number;
  legibilidad: { puntaje: number; nivel: string };
  diversidadLexica: number;
  palabrasClave: { palabra: string; veces: number }[];
  resumen: string[];
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function splitSentences(text: string): string[] {
  // Los párrafos siempre cortan oración; dentro de cada uno se corta tras . ! ? …
  return text
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/u))
    .map((s) => s.replace(/^[\s—–-]+/, '').trim())
    .filter((s) => (s.match(WORD_RE)?.length ?? 0) >= 3);
}

function syllables(word: string): number {
  const groups = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function readabilityLevel(score: number) {
  if (score >= 90) return 'Muy fácil';
  if (score >= 80) return 'Fácil';
  if (score >= 70) return 'Algo fácil';
  if (score >= 60) return 'Normal';
  if (score >= 50) return 'Algo difícil';
  if (score >= 30) return 'Difícil';
  return 'Muy difícil';
}

export function analyzeOffline(text: string): OfflineAnalysis {
  const words = text.match(WORD_RE) ?? [];
  const lower = words.map((w) => w.toLowerCase());
  const sentences = splitSentences(text);
  const sentenceCount = Math.max(1, sentences.length);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;

  const frequencies = new Map<string, number>();
  for (const w of lower) {
    if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    frequencies.set(w, (frequencies.get(w) ?? 0) + 1);
  }
  const keywords = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([palabra, veces]) => ({ palabra, veces }));

  // Fernández Huerta: 206.84 − 0.60·(sílabas por 100 palabras) − 1.02·(oraciones por 100 palabras)
  const totalWords = Math.max(1, words.length);
  const syllablesPer100 = (words.reduce((sum, w) => sum + syllables(w), 0) / totalWords) * 100;
  const sentencesPer100 = (sentenceCount / totalWords) * 100;
  const score = Math.round(Math.min(100, Math.max(0, 206.84 - 0.6 * syllablesPer100 - 1.02 * sentencesPer100)));

  // Resumen extractivo: las oraciones con más palabras clave, en su orden original.
  const maxFreq = keywords[0]?.veces ?? 1;
  const scored = sentences.map((sentence, index) => {
    const tokens = (sentence.match(WORD_RE) ?? []).map((w) => w.toLowerCase());
    const weight = tokens.reduce((sum, t) => sum + (frequencies.get(t) ?? 0) / maxFreq, 0);
    return { sentence, index, score: weight / Math.sqrt(tokens.length || 1) };
  });
  const summaryCount = Math.min(5, Math.max(1, Math.round(sentences.length / 8)));
  const summary = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, summaryCount)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);

  return {
    version: 1,
    palabras: words.length,
    palabrasUnicas: new Set(lower).size,
    caracteres: text.length,
    oraciones: sentences.length,
    parrafos: paragraphs,
    promedioPalabrasPorOracion: Math.round((words.length / sentenceCount) * 10) / 10,
    minutosLectura: Math.max(1, Math.round(words.length / 200)),
    legibilidad: { puntaje: score, nivel: readabilityLevel(score) },
    diversidadLexica: Math.round((new Set(lower).size / totalWords) * 100),
    palabrasClave: keywords,
    resumen: summary,
  };
}

const numberFormat = new Intl.NumberFormat('es');

export const formatNumber = (n: number) => numberFormat.format(n);

/** SQLite guarda las fechas en UTC sin zona ("2026-09-26 10:00:00"). */
export function parseDbDate(value: string) {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export function formatDate(value: string) {
  return parseDbDate(value).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(value: string) {
  const seconds = Math.round((Date.now() - parseDbDate(value).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (seconds < 60) return 'hace un momento';
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour');
  if (seconds < 86400 * 30) return rtf.format(-Math.round(seconds / 86400), 'day');
  return formatDate(value);
}

/**
 * Copia al portapapeles. La API moderna solo existe en HTTPS o localhost; al abrir la app
 * por IP en la red local se usa el método antiguo como alternativa.
 */
export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('No se pudo copiar el texto');
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

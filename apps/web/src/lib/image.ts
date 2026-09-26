const MAX_SIDE = 2200;
// Límite del plan gratuito de OCR.space.
const MAX_BYTES = 1024 * 1024 - 32 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality),
  );
}

/**
 * Normaliza una foto para OCR: corrige la orientación, reduce el tamaño y la comprime a JPEG
 * por debajo de 1 MB para que sea aceptada por todos los motores.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let quality = 0.88;

  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas no disponible');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_BYTES) return blob;
      if (quality > 0.65) quality -= 0.1;
      else scale *= 0.85;
    }
    throw new Error('La imagen es demasiado grande');
  } finally {
    bitmap.close();
  }
}

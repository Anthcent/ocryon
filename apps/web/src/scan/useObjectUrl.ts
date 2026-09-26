import { useEffect, useState } from 'react';

/** URL temporal para mostrar un Blob en un <img>; se libera al desmontar o cambiar. */
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

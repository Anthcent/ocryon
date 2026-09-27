import { Fragment } from 'react';

/** El servidor marca las coincidencias con \u0002…\u0003; se convierten en <mark> sin usar HTML crudo. */
export function Snippet({ value }: { value: string }) {
  const parts = value.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('\u0002') ? (
          <mark key={i} className="hit">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

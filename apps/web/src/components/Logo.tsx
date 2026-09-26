import clsx from 'clsx';

export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#58CC02" />
      <path d="M12 20c7-3 14-3 20 1v28c-6-4-13-4-20-1z" fill="#fff" />
      <path d="M52 20c-7-3-14-3-20 1v28c6-4 13-4 20-1z" fill="#D7FFB8" />
      <circle cx="22" cy="31" r="4" fill="#4B4B4B" />
      <circle cx="42" cy="31" r="4" fill="#4B4B4B" />
      <circle cx="23.3" cy="29.7" r="1.3" fill="#fff" />
      <circle cx="43.3" cy="29.7" r="1.3" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <Mascot className="size-9" />
      <span className="text-2xl font-black tracking-tight text-feather">ocryon</span>
    </div>
  );
}

import clsx from 'clsx';
import { BookOpen } from 'lucide-react';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import type { Group } from '../lib/types';

const SIZES = {
  sm: { box: 'w-20 h-28', title: 'text-[10px]', author: 'hidden', pad: 'p-2 pl-3.5', icon: 'size-8' },
  md: { box: 'w-32 h-44', title: 'text-sm', author: 'text-[10px]', pad: 'p-3 pl-5', icon: 'size-14' },
  lg: { box: 'w-32 h-44 sm:w-48 sm:h-64', title: 'text-lg sm:text-xl', author: 'text-xs sm:text-sm', pad: 'p-4 pl-7', icon: 'size-20' },
};

/** Portada de libro en 3D: lomo, canto de las hojas, brillo y título. */
export function BookCover({ group, size = 'md', className }: { group: Pick<Group, 'title' | 'author' | 'category' | 'color'>; size?: keyof typeof SIZES; className?: string }) {
  const style = GROUP_STYLES[group.color];
  const s = SIZES[size];
  return (
    <div className={clsx('shrink-0 [perspective:900px]', className)}>
      <div
        className={clsx('relative transition-transform duration-500 [transform-style:preserve-3d] [transform:rotateY(-16deg)] hover:[transform:rotateY(-4deg)]', s.box)}
      >
        {/* Canto de las hojas */}
        <div className="absolute inset-y-1.5 -right-2 w-3 rounded-r-md bg-[repeating-linear-gradient(to_bottom,#fffdf6_0px,#fffdf6_2px,#e8e1cc_3px)] shadow-inner" />
        {/* Tapa */}
        <div className={clsx('absolute inset-0 overflow-hidden rounded-r-xl rounded-l-md text-white shadow-[8px_10px_24px_rgba(0,0,0,0.25)]', style.bg)}>
          <span className="absolute inset-y-0 left-0 w-2.5 bg-black/20" />
          <span className="absolute inset-y-0 left-2.5 w-px bg-white/40" />
          <span className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/15" />
          <BookOpen className={clsx('absolute -bottom-3 -right-3 text-white/15', s.icon)} />
          <div className={clsx('relative flex h-full flex-col', s.pad)}>
            {group.category && size !== 'sm' && <span className="text-base leading-none">{categoryEmoji(group.category)}</span>}
            <div className={clsx('mt-auto line-clamp-4 font-black leading-tight', s.title)}>{group.title}</div>
            {group.author && <div className={clsx('mt-1 truncate font-bold text-white/85', s.author)}>{group.author}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

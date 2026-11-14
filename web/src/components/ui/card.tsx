// shadcn/ui Card composition, adapted to local CSS rather than Tailwind.
import type { ComponentProps } from 'react';
import { clsx } from 'clsx';
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="card" className={clsx('card', className)} {...props} />;
}

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...classes: (string | undefined | null | boolean)[]) {
  return twMerge(clsx(classes));
}

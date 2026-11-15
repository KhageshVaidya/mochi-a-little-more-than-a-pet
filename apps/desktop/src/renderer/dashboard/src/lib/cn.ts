import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** Mission elapsed time label, e.g. "MET 012d". */
export function metLabel(day: number): string {
  return `MET ${pad(day, 3)}d`;
}

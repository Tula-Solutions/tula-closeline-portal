import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names and lets the later Tailwind utility win over an earlier one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

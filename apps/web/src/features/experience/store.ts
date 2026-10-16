import { createContext, useContext } from 'react';
import type { Space } from './model';
export const Store = createContext<{
  spaces: Space[];
  save: (spaces: Space[]) => boolean;
  error: string;
  clearError: () => void;
} | null>(null);
export function useSpaces() {
  const context = useContext(Store);
  if (!context) throw new Error('Workspace store missing');
  return context;
}
export const number = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
export const path = (space: Space, section = 'overview') =>
  `/preview/w/${encodeURIComponent(space.id)}/${section}`;
export const uid = () => crypto.randomUUID();

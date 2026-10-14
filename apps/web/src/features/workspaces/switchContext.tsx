import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type WorkspaceSwitchContextValue = {
  canSwitch: (message?: string) => boolean;
  registerDirtyGuard: (key: string, isDirty: () => boolean) => () => void;
};

const WorkspaceSwitchContext = createContext<WorkspaceSwitchContextValue>({
  canSwitch: () => true,
  registerDirtyGuard: () => () => undefined,
});

export function WorkspaceSwitchProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, () => boolean>());
  const registerDirtyGuard = useCallback((key: string, isDirty: () => boolean) => {
    guards.current.set(key, isDirty);
    return () => guards.current.delete(key);
  }, []);
  const canSwitch = useCallback((message?: string) => {
    const hasUnsavedChanges = Array.from(guards.current.values()).some((isDirty) => isDirty());
    return !hasUnsavedChanges || window.confirm(message ?? 'تغییرات ذخیره‌نشده باقی می‌مانند. از این فضا خارج شوید؟');
  }, []);

  return (
    <WorkspaceSwitchContext.Provider value={{ canSwitch, registerDirtyGuard }}>
      {children}
    </WorkspaceSwitchContext.Provider>
  );
}

export function useWorkspaceSwitch() {
  return useContext(WorkspaceSwitchContext);
}

export function useWorkspaceDirtyGuard(key: string, isDirty: boolean) {
  const { registerDirtyGuard } = useWorkspaceSwitch();
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  useEffect(
    () => registerDirtyGuard(key, () => dirtyRef.current),
    [key, registerDirtyGuard],
  );
}

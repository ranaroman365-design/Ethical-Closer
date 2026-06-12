import { createContext, useContext, useState, ReactNode } from 'react';

export type ClosingMode = 'closing' | 'top_closing' | 'ethical';

interface ModeContextValue {
  mode: ClosingMode;
  setMode: (m: ClosingMode) => void;
  hasToggledOnce: boolean;
}

const ModeContext = createContext<ModeContextValue>({
  mode: 'closing',
  setMode: () => {},
  hasToggledOnce: false,
});

export const useClosingMode = () => useContext(ModeContext);

export function ClosingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeInternal] = useState<ClosingMode>('closing');
  const [hasToggledOnce, setHasToggledOnce] = useState(false);

  const setMode = (m: ClosingMode) => {
    if (!hasToggledOnce) setHasToggledOnce(true);
    setModeInternal(m);
  };

  return (
    <ModeContext.Provider value={{ mode, setMode, hasToggledOnce }}>
      {children}
    </ModeContext.Provider>
  );
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Settings } from '../lib/types';

const DEFAULTS: Settings = {
  defaultEngine: 'ocrspace',
  ocrLanguage: 'spa',
  autoScan: false,
  geminiModel: 'gemini-2.5-flash',
  keys: {
    ocrspace: { configured: false, source: 'none', masked: '' },
    gemini: { configured: false, source: 'none', masked: '' },
  },
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  setSettings: (s: Settings) => void;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSettings(await api.settings.get());
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <SettingsContext.Provider value={{ settings, loaded, setSettings, reload }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings fuera de SettingsProvider');
  return ctx;
}

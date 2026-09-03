'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  PERSONAS,
  PERSONA_STORAGE_KEY,
  PERSONAS_WITH_WRITE_ACCESS,
  defaultPersonaForRole,
  type Persona,
} from './personas';

// Re-exported so existing client-side imports from this module keep working.
// The definitions live in ./personas (a non-client module) so Server
// Components can call defaultPersonaForRole without hitting the RSC client
// boundary, where non-component exports become non-callable stubs.
export { PERSONAS, PERSONAS_WITH_WRITE_ACCESS, defaultPersonaForRole };
export type { Persona };

interface DashboardUIState {
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  helpDrawerOpen: boolean;
  openHelpDrawer: () => void;
  closeHelpDrawer: () => void;
  /** WP8 — the in-app Support & Ticket Submission modal. A separate open
   * flag from helpDrawerOpen (rather than one "overlay" state) because
   * HelpDrawer's own "Contact Support" CTA opens this *on top of* itself
   * closing, and the Header's support trigger opens it with no help
   * drawer involved at all — two independent entry points into the same
   * modal, same pattern as commandPaletteOpen/helpDrawerOpen already are. */
  supportModalOpen: boolean;
  openSupportModal: () => void;
  closeSupportModal: () => void;
  persona: Persona;
  setPersona: (p: Persona) => void;
}

const DashboardUIContext = createContext<DashboardUIState | null>(null);

export function DashboardUIProvider({ children, defaultPersona }: { children: ReactNode; defaultPersona: Persona }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [persona, setPersonaState] = useState<Persona>(defaultPersona);

  // Restore a persona choice from a prior visit in this browser. Falls
  // back silently (private windows, storage disabled) — persona always
  // has a valid value either way.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
      if (stored && PERSONAS.some((p) => p.key === stored)) setPersonaState(stored as Persona);
    } catch {
      // ignore
    }
  }, []);

  const setPersona = useCallback((p: Persona) => {
    setPersonaState(p);
    try {
      window.localStorage.setItem(PERSONA_STORAGE_KEY, p);
    } catch {
      // ignore
    }
  }, []);

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const openHelpDrawer = useCallback(() => setHelpDrawerOpen(true), []);
  const closeHelpDrawer = useCallback(() => setHelpDrawerOpen(false), []);
  const openSupportModal = useCallback(() => setSupportModalOpen(true), []);
  const closeSupportModal = useCallback(() => setSupportModalOpen(false), []);

  // Global Cmd+K / Ctrl+K shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setHelpDrawerOpen(false);
        setSupportModalOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<DashboardUIState>(
    () => ({
      commandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
      helpDrawerOpen,
      openHelpDrawer,
      closeHelpDrawer,
      supportModalOpen,
      openSupportModal,
      closeSupportModal,
      persona,
      setPersona,
    }),
    [
      commandPaletteOpen,
      helpDrawerOpen,
      supportModalOpen,
      persona,
      openCommandPalette,
      closeCommandPalette,
      openHelpDrawer,
      closeHelpDrawer,
      openSupportModal,
      closeSupportModal,
      setPersona,
    ]
  );

  return <DashboardUIContext.Provider value={value}>{children}</DashboardUIContext.Provider>;
}

export function useDashboardUI(): DashboardUIState {
  const ctx = useContext(DashboardUIContext);
  if (!ctx) throw new Error('useDashboardUI must be used within a DashboardUIProvider');
  return ctx;
}

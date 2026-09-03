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
  /** Opens the global ⌘K palette (mounted at the app root — see CommandK). */
  openCommandPalette: () => void;
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

  // The ⌘K palette lives at the app root (CommandK) so it works on every
  // surface, not just the dashboard — this just pokes it open.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent('a2r:command-k'));
  }, []);
  const openHelpDrawer = useCallback(() => setHelpDrawerOpen(true), []);
  const closeHelpDrawer = useCallback(() => setHelpDrawerOpen(false), []);
  const openSupportModal = useCallback(() => setSupportModalOpen(true), []);
  const closeSupportModal = useCallback(() => setSupportModalOpen(false), []);

  // Escape closes the help drawer / support modal (the palette handles its own).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setHelpDrawerOpen(false);
        setSupportModalOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<DashboardUIState>(
    () => ({
      openCommandPalette,
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
      helpDrawerOpen,
      supportModalOpen,
      persona,
      openCommandPalette,
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

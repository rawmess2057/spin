"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BuyChipsModal, type BuyChipsTab } from "./buy-chips-modal";

type BuyChipsApi = {
  open: (tab?: BuyChipsTab) => void;
  close: () => void;
};

const BuyChipsContext = createContext<BuyChipsApi>({
  open: () => {},
  close: () => {},
});

/** Mounts the Buy chips modal once and lets any component open it. */
export function BuyChipsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<BuyChipsTab | null>(null);
  const open = useCallback((t: BuyChipsTab = "buy") => setTab(t), []);
  const close = useCallback(() => setTab(null), []);
  const api = useMemo(() => ({ open, close }), [open, close]);
  return (
    <BuyChipsContext.Provider value={api}>
      {children}
      <BuyChipsModal tab={tab} onTabChange={setTab} onClose={close} />
    </BuyChipsContext.Provider>
  );
}

export function useBuyChips(): BuyChipsApi {
  return useContext(BuyChipsContext);
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CLUSTERS, type ClusterMoniker } from "../solana/config";
import { getExplorerUrl } from "../solana/explorer";

export { CLUSTERS };

type ClusterContextValue = {
  cluster: ClusterMoniker;
  setCluster: (cluster: ClusterMoniker) => void;
  getExplorerUrl: (path: string) => string;
};

const ClusterContext = createContext<ClusterContextValue | null>(null);

const STORAGE_KEY = "solana-cluster";
const CLUSTER_EVENT = "cluster-change";

function readStoredCluster(): ClusterMoniker {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CLUSTERS.includes(stored as ClusterMoniker)) {
      return stored as ClusterMoniker;
    }
  } catch {
    // localStorage unavailable (e.g. Safari private mode)
  }
  return "devnet";
}

function getServerCluster(): ClusterMoniker {
  return "devnet";
}

function subscribeCluster(callback: () => void) {
  window.addEventListener(CLUSTER_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CLUSTER_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function ClusterProvider({ children }: { children: ReactNode }) {
  const cluster = useSyncExternalStore(
    subscribeCluster,
    readStoredCluster,
    getServerCluster
  );

  const setCluster = useCallback((c: ClusterMoniker) => {
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // localStorage unavailable (e.g. Safari private mode)
    }
    window.dispatchEvent(new Event(CLUSTER_EVENT));
  }, []);

  const explorerUrl = useCallback(
    (path: string) => getExplorerUrl(path, cluster),
    [cluster]
  );

  return (
    <ClusterContext.Provider
      value={{ cluster, setCluster, getExplorerUrl: explorerUrl }}
    >
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}

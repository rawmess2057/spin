"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { address, formatDecimalFixedPoint, lamportsToSol } from "@solana/kit";
import {
  useWallets,
  useConnect,
  useDisconnect,
  useConnectedWallet,
  useWalletStatus,
} from "@solana/kit-plugin-wallet/react";
import { useBalance } from "../../lib/hooks/use-balance";
import { ellipsify } from "../../lib/solana/explorer";
import { useCluster } from "../../lib/hooks/use-cluster";
import { useAppClient } from "../../lib/hooks/use-app-client";

const solFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 5,
});

export function WalletButton() {
  const client = useAppClient();
  const wallets = useWallets(client);
  const status = useWalletStatus(client);
  const connected = useConnectedWallet(client);
  const { dispatch: connect, error } = useConnect(client);
  const { dispatch: disconnect } = useDisconnect(client);

  const { getExplorerUrl } = useCluster();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Wallet-standard can restore a connection before React hydrates, so the
  // client's first render would differ from the server's (which has no
  // connected wallet yet) and throw a hydration mismatch. Hold the button in
  // its disconnected state until after mount so both trees agree.
  // A no-op store that flips to `true` only on the client after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const shownConnected = mounted && connected != null;
  const walletAddress = shownConnected ? connected?.account?.address : undefined;
  const balance = useBalance(
    walletAddress ? address(walletAddress) : undefined
  );

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure origin) or permission denied.
    }
  };

  if (!shownConnected) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => (isOpen ? close() : open())}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-[0_0_16px_rgba(0,255,163,0.4)] transition hover:brightness-110"
        >
          Connect Wallet
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border-low bg-card p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-muted">
              Choose a wallet
            </p>
            {wallets.length === 0 ? (
              <p className="text-xs text-muted">
                No wallets detected. Install a Solana wallet extension.
              </p>
            ) : (
              <div className="space-y-1">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => {
                      connect(wallet);
                      close();
                    }}
                    disabled={status === "connecting"}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-cream disabled:pointer-events-none disabled:opacity-50"
                  >
                    {wallet.icon && (
                      // eslint-disable-next-line @next/next/no-img-element -- wallet-standard icons are data URIs
                      <img
                        src={wallet.icon}
                        alt=""
                        className="h-5 w-5 rounded"
                      />
                    )}
                    <span>{wallet.name}</span>
                  </button>
                ))}
              </div>
            )}
            {status === "connecting" && (
              <p className="mt-2 text-xs text-muted">Connecting...</p>
            )}
            {error != null && (
              <p className="mt-2 text-xs text-destructive">
                {error instanceof Error ? error.message : String(error)}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (isOpen ? close() : open())}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-low bg-card px-3 py-2 text-xs font-medium transition hover:bg-cream"
      >
        <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_rgba(0,255,163,0.8)]" />
        <span className="font-mono">{ellipsify(walletAddress!, 4)}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border-low bg-card p-4 shadow-lg">
          <div className="mb-3">
            <p className="text-xs text-muted">Balance</p>
            <p className="text-lg font-bold tabular-nums">
              {balance.lamports != null
                ? formatDecimalFixedPoint(
                    solFormatter,
                    lamportsToSol(balance.lamports)
                  )
                : "—"}{" "}
              <span className="text-sm font-normal text-muted">SOL</span>
            </p>
          </div>

          <div className="mb-3 rounded-lg border border-border-low bg-cream/50 px-3 py-2">
            <p className="break-all font-mono text-xs">{walletAddress}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 cursor-pointer rounded-lg border border-border-low bg-card px-3 py-2 text-xs font-medium transition hover:bg-cream"
            >
              {copied ? "Copied!" : "Copy address"}
            </button>
            <a
              href={getExplorerUrl(`/address/${walletAddress}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-border-low bg-card px-3 py-2 text-center text-xs font-medium transition hover:bg-cream"
            >
              Explorer
            </a>
          </div>

          <button
            onClick={() => {
              disconnect();
              close();
            }}
            className="mt-2 w-full cursor-pointer rounded-lg border border-border-low bg-card px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

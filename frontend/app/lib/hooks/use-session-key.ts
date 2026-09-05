"use client";

import { useCallback, useEffect, useState } from "react";
import { createSignerFromKeyPair, type KeyPairSigner } from "@solana/kit";

/**
 * The browser-held session key that signs bets so the player's wallet doesn't
 * have to prompt on every spin.
 *
 * The keypair is generated **non-extractable** (the default in @solana/kit),
 * so the private key exists only as a CryptoKey handle — its bytes are never
 * visible to JavaScript and cannot be read out by injected script. The handle
 * is persisted to IndexedDB, which structured-clones CryptoKey objects, so it
 * survives reloads without ever being serialized.
 *
 * On its own the key authorizes nothing: it only works once the player signs
 * `set_delegate`, and the program bounds it by an expiry slot and a spend cap.
 * It can never withdraw.
 */

const DB_NAME = "spin-session";
const STORE = "keys";
const KEY_ID = "delegate";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadStoredKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openDb();
  try {
    const stored = await idbGet(db, KEY_ID);
    if (
      stored &&
      typeof stored === "object" &&
      "privateKey" in stored &&
      "publicKey" in stored
    ) {
      return stored as CryptoKeyPair;
    }
    return null;
  } finally {
    db.close();
  }
}

/**
 * Web Crypto's Ed25519 generateKey is what @solana/kit uses internally; going
 * direct keeps the CryptoKeyPair intact so it can be stored in IndexedDB.
 */
async function generateStoredKeyPair(): Promise<CryptoKeyPair> {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const db = await openDb();
  try {
    await idbPut(db, KEY_ID, keyPair);
  } finally {
    db.close();
  }
  return keyPair;
}

export type SessionKeyState = {
  signer: KeyPairSigner | null;
  isLoading: boolean;
  /** Creates a fresh key, replacing any existing one. */
  rotate: () => Promise<KeyPairSigner>;
  /** Forgets the key entirely (the on-chain delegate must be revoked too). */
  clear: () => Promise<void>;
};

export function useSessionKey(): SessionKeyState {
  const [signer, setSigner] = useState<KeyPairSigner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadStoredKeyPair();
        const keyPair = stored ?? (await generateStoredKeyPair());
        const next = await createSignerFromKeyPair(keyPair);
        if (!cancelled) setSigner(next);
      } catch (err) {
        // Private browsing modes can block IndexedDB. Fall back to an
        // in-memory key: the session simply won't survive a reload.
        console.error("useSessionKey: persistence unavailable", err);
        try {
          const keyPair = (await crypto.subtle.generateKey("Ed25519", false, [
            "sign",
            "verify",
          ])) as CryptoKeyPair;
          const next = await createSignerFromKeyPair(keyPair);
          if (!cancelled) setSigner(next);
        } catch (inner) {
          console.error("useSessionKey: key generation failed", inner);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rotate = useCallback(async () => {
    const keyPair = await generateStoredKeyPair();
    const next = await createSignerFromKeyPair(keyPair);
    setSigner(next);
    return next;
  }, []);

  const clear = useCallback(async () => {
    const db = await openDb();
    try {
      await idbDelete(db, KEY_ID);
    } finally {
      db.close();
    }
    setSigner(null);
  }, []);

  return { signer, isLoading, rotate, clear };
}

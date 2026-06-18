import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { HttpClient, type PharosIncidentClient } from "@pharos-incident/sdk";
import { MockClient, freshDemoState, type DemoState } from "./MockClient.js";

export interface ClientContextValue {
  client: PharosIncidentClient;
  state: DemoState;
  live: boolean;
  apiBase: string;
  setApiBase: (s: string) => void;
  reset: () => void;
}

const Ctx = createContext<ClientContextValue | null>(null);

export function ClientProvider(props: { children: React.ReactNode; initialClient?: PharosIncidentClient; initialApiBase?: string }) {
  const initialBase = props.initialApiBase ?? (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8787";
  const [apiBase, setApiBase] = useState<string>(initialBase);
  const stateRef = useRef<DemoState | null>(null);
  if (!stateRef.current) stateRef.current = freshDemoState();

  const [tick, setTick] = useState(0);
  const [live, setLive] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (props.initialClient) {
      setLive(true);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase}/health`);
        if (!r.ok) throw new Error("health check failed");
        if (!cancelled) setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, props.initialClient]);

  // re-render every second to keep relative times fresh
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const value = useMemo<ClientContextValue>(() => {
    const state = stateRef.current!;
    const client: PharosIncidentClient = props.initialClient
      ?? (live ? new HttpClient(apiBase) : new MockClient(state));
    return {
      client,
      state,
      live,
      apiBase,
      setApiBase,
      reset: () => {
        stateRef.current = freshDemoState();
        setTick((t) => t + 1);
      },
    };
    // tick is referenced to force memo re-creation when timers refresh (no-op)
  }, [apiBase, live, props.initialClient, tick]);

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useClient(): ClientContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClient must be used inside ClientProvider");
  return v;
}

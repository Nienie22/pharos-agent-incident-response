import React, { useEffect, useState } from "react";
import { HttpClient, type PharosIncidentClient } from "@pharos-incident/sdk";
import type { Hex, ResponsePlan } from "@pharos-incident/policy";

type Status = "wrong-network" | "stale-data" | "service-offline" | "rejected-signature" | "ok";

interface Banner { status: Status; message: string }

export function CommandCenter(props: { client?: PharosIncidentClient }) {
  const client = props.client ?? new HttpClient((import.meta as any).env?.VITE_API_URL ?? "http://localhost:8787");
  const [plan, setPlan] = useState<ResponsePlan | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await client.triage(("0x" + "00".repeat(32)) as Hex);
        if (!cancelled) setBanner(null);
      } catch (e: any) {
        if (!cancelled) setBanner({ status: "service-offline", message: e?.message ?? "API offline" });
      }
    })();
    return () => { cancelled = true; };
  }, [client]);

  async function approve(planHash: Hex) {
    setBusy(true);
    try {
      const r = await client.approve({
        planHash,
        approver: ("0x" + "11".repeat(20)) as Hex,
        signature: ("0x" + "22".repeat(65)) as Hex,
      });
      if (!r.ready) setBanner({ status: "rejected-signature", message: "approval rejected" });
    } finally { setBusy(false); }
  }

  async function execute(planHash: Hex) {
    setBusy(true);
    try {
      const r = await client.execute({
        planHash,
        approver: ("0x" + "11".repeat(20)) as Hex,
        signature: ("0x" + "22".repeat(65)) as Hex,
      });
      if (r.txHash === ("0x" as Hex)) {
        setBanner({ status: "wrong-network", message: "no tx hash; check network" });
      }
    } finally { setBusy(false); }
  }

  return (
    <div data-testid="command-center">
      <h1>Pharos Incident Command Center</h1>
      {banner && (
        <div role="alert" data-status={banner.status} style={{ padding: 8, background: "#fee" }}>
          {banner.message}
        </div>
      )}
      {!plan ? (
        <button
          disabled={busy}
          onClick={async () => {
            const r = await client.propose(("0x" + "00".repeat(32)) as Hex);
            setPlan(r);
          }}
        >Load plan</button>
      ) : (
        <section>
          <h2>Plan {plan.planHash.slice(0, 10)}…</h2>
          <p>Severity (required approvals): {plan.requiredApprovals}</p>
          <ul>
            {plan.actions.map((a, i) => (
              <li key={i} data-state="proposed">
                {a.kind} on {a.target} — calldata {a.calldata.slice(0, 10)}…
              </li>
            ))}
          </ul>
          <button disabled={busy} onClick={() => approve(plan.planHash)}>Approve</button>
          <button disabled={busy} onClick={() => execute(plan.planHash)}>Execute</button>
        </section>
      )}
    </div>
  );
}

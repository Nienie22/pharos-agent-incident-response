import type { Hex } from "@pharos-incident/policy";

export interface AddressRisk {
  address: Hex;
  isMalicious: boolean;
  tags: string[];
  coverage: "FULL" | "PARTIAL" | "UNSUPPORTED";
  fetchedAt: number;
}

export interface GoPlusClient {
  addressRisk(address: Hex): Promise<AddressRisk>;
  approvalRisk(owner: Hex, spender: Hex, token: Hex): Promise<AddressRisk>;
}

export class MockGoPlusClient implements GoPlusClient {
  async addressRisk(address: Hex): Promise<AddressRisk> {
    return {
      address,
      isMalicious: address.endsWith("bad"),
      tags: [],
      coverage: "UNSUPPORTED",
      fetchedAt: Date.now(),
    };
  }
  async approvalRisk(owner: Hex, spender: Hex): Promise<AddressRisk> {
    return {
      address: spender,
      isMalicious: spender.endsWith("bad"),
      tags: [],
      coverage: "UNSUPPORTED",
      fetchedAt: Date.now(),
    };
  }
}

export class LiveGoPlusClient implements GoPlusClient {
  constructor(private readonly apiKey: string, private readonly base = "https://api.gopluslabs.io/api/v1") {}
  private async get<T>(path: string): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      headers: { "X-API-KEY": this.apiKey },
    });
    if (!r.ok) throw new Error(`goplus ${path} ${r.status}`);
    return (await r.json()) as T;
  }
  async addressRisk(address: Hex): Promise<AddressRisk> {
    try {
      const j = await this.get<any>(`/address_security/${address}`);
      return {
        address,
        isMalicious: !!j?.result?.is_malicious_address,
        tags: j?.result?.phishing_site ?? [],
        coverage: j ? "FULL" : "UNSUPPORTED",
        fetchedAt: Date.now(),
      };
    } catch {
      return { address, isMalicious: false, tags: [], coverage: "UNSUPPORTED", fetchedAt: Date.now() };
    }
  }
  async approvalRisk(owner: Hex, spender: Hex): Promise<AddressRisk> {
    return this.addressRisk(spender);
  }
}

export function makeGoPlus(): GoPlusClient {
  const key = process.env.GOPLUS_API_KEY;
  if (process.env.LIVE_INTEGRATIONS === "1" && key) return new LiveGoPlusClient(key);
  return new MockGoPlusClient();
}

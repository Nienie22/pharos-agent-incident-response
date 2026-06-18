import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import type { Hex } from "./types.js";

type PackedType = "string" | "address" | "bytes" | "bytes32" | "uint256";
type PackedValue = string | bigint;

function prefixed(hex: string): Hex {
  return ("0x" + hex) as Hex;
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function hexToBytesStrict(value: string, expectedBytes?: number): Uint8Array {
  const hex = strip0x(value);
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("invalid hex value");
  }
  if (expectedBytes !== undefined && hex.length !== expectedBytes * 2) {
    throw new Error(`expected ${expectedBytes} bytes`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function uint256ToBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("uint256 cannot be negative");
  const hex = value.toString(16).padStart(64, "0");
  if (hex.length > 64) throw new Error("uint256 overflow");
  return hexToBytesStrict(hex);
}

export function keccakHex(bytes: Uint8Array): Hex {
  return prefixed(bytesToHex(keccak_256(bytes)));
}

export function encodePacked(types: PackedType[], values: PackedValue[]): Uint8Array {
  if (types.length !== values.length) {
    throw new Error("packed type/value length mismatch");
  }
  return concatBytes(
    ...types.map((type, idx) => {
      const value = values[idx];
      switch (type) {
        case "string":
          return utf8ToBytes(String(value));
        case "address":
          return hexToBytesStrict(String(value), 20);
        case "bytes":
          return hexToBytesStrict(String(value));
        case "bytes32":
          return hexToBytesStrict(String(value), 32);
        case "uint256":
          return uint256ToBytes(BigInt(value));
      }
    }),
  );
}

export function packAndHash(types: PackedType[], values: PackedValue[]): Hex {
  return keccakHex(encodePacked(types, values));
}

export function hashString(input: string): Hex {
  return keccakHex(utf8ToBytes(input));
}

export function hashAction(a: {
  kind: string;
  target: Hex;
  calldata: Hex;
  value: bigint;
  reasonHash: Hex;
}): Hex {
  return packAndHash(
    ["string", "address", "bytes", "uint256", "bytes32"],
    [a.kind, a.target, a.calldata, a.value, a.reasonHash],
  );
}

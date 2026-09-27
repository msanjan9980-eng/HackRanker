import { createHash, randomBytes } from "node:crypto";

export const sha256Hex = (input: string): string =>
  createHash("sha256").update(input).digest("hex");

export const randomHex = (bytes = 32): string =>
  randomBytes(bytes).toString("hex");
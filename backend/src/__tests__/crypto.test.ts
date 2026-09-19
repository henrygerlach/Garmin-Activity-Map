import { describe, expect, it } from "vitest";

process.env.CREDENTIALS_ENCRYPTION_KEY = "0".repeat(64);
const { decrypt, encrypt } = await import("../crypto.js");

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string", () => {
    const ciphertext = encrypt("hunter2");
    expect(ciphertext).not.toBe("hunter2");
    expect(decrypt(ciphertext)).toBe("hunter2");
  });

  it("produces a different ciphertext each time (random iv)", () => {
    expect(encrypt("hunter2")).not.toBe(encrypt("hunter2"));
  });

  it("throws when the ciphertext has been tampered with", () => {
    const ciphertext = encrypt("hunter2");
    const tampered = ciphertext.slice(0, -4) + "abcd";
    expect(() => decrypt(tampered)).toThrow();
  });
});

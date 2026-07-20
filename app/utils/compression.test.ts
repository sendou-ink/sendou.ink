import { describe, expect, it } from "vitest";
import { compressToBase64, decompressFromBase64 } from "./compression";

describe("compressToBase64 & decompressFromBase64", () => {
	it("round-trips a string", () => {
		const value = JSON.stringify({ name: "trophy", mesh: [1, 2, 3] });

		expect(decompressFromBase64(compressToBase64(value))).toBe(value);
	});

	it("round-trips unicode content", () => {
		const value = "tröphy \u{1f3c6} テスト";

		expect(decompressFromBase64(compressToBase64(value))).toBe(value);
	});

	it("round-trips with the url safe alphabet", () => {
		const value = "a".repeat(1000) + JSON.stringify({ b: [4, 5, 6] });
		const compressed = compressToBase64(value, { urlSafe: true });

		expect(compressed).not.toMatch(/[+/=]/);
		expect(decompressFromBase64(compressed)).toBe(value);
	});

	it("returns null for corrupt input", () => {
		expect(decompressFromBase64("!!!not base64!!!")).toBeNull();
		expect(decompressFromBase64(btoa("not deflate data"))).toBeNull();
		expect(decompressFromBase64("")).toBeNull();
	});

	it("returns null for truncated input", () => {
		const compressed = compressToBase64("some longer input to compress");

		expect(decompressFromBase64(compressed.slice(0, 4))).toBeNull();
	});
});

import { deflateRaw, inflateRaw } from "pako";

/**
 * Compresses a string with raw deflate and encodes the result as base64.
 * With `urlSafe` the output uses the URL-safe base64 alphabet without padding.
 */
export function compressToBase64(
	value: string,
	options?: { urlSafe?: boolean },
) {
	const bytes = deflateRaw(value, { level: 9 });
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	const base64 = btoa(binary);
	if (!options?.urlSafe) return base64;

	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decompresses a base64 encoded (standard or URL-safe alphabet) raw deflate
 * string. Returns `null` if the input is corrupt.
 */
export function decompressFromBase64(compressed: string) {
	try {
		const base64 = compressed.replace(/-/g, "+").replace(/_/g, "/");
		const value = inflateRaw(
			Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
			{ to: "string" },
		);

		if (!value) return null;

		return value;
	} catch {
		return null;
	}
}

import { deflateSync, Inflate, strToU8 } from "fflate";

/**
 * Compresses a string with raw deflate and encodes the result as base64.
 * With `urlSafe` the output uses the URL-safe base64 alphabet without padding.
 */
export function compressToBase64(
	value: string,
	options?: { urlSafe?: boolean },
) {
	const bytes = deflateSync(strToU8(value), { level: 9 });
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
 * string. Returns `null` if the input is corrupt or, when
 * `maxDecompressedBytes` is given, if it inflates past that limit (a
 * decompression bomb guard for attacker controlled input).
 */
export function decompressFromBase64(
	compressed: string,
	options?: { maxDecompressedBytes?: number },
) {
	const maxDecompressedBytes =
		options?.maxDecompressedBytes ?? Number.POSITIVE_INFINITY;

	try {
		const base64 = compressed.replace(/-/g, "+").replace(/_/g, "/");

		const chunks: Array<Uint8Array> = [];
		let decompressedBytes = 0;
		const inflator = new Inflate((chunk) => {
			decompressedBytes += chunk.length;
			if (decompressedBytes > maxDecompressedBytes) {
				throw new Error("Decompressed value over the maximum size");
			}
			chunks.push(chunk);
		});

		inflator.push(
			Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
			true,
		);

		const value = new TextDecoder().decode(concatChunks(chunks));

		if (!value) return null;

		return value;
	} catch {
		return null;
	}
}

function concatChunks(chunks: Array<Uint8Array>) {
	const totalBytes = chunks.reduce((total, chunk) => total + chunk.length, 0);
	const result = new Uint8Array(totalBytes);

	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

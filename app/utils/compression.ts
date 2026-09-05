import { deflateSync, Inflate, strToU8 } from "fflate";

/** Raw deflate + base64; `urlSafe` uses the URL-safe alphabet without padding. */
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
 * Inverse of {@link compressToBase64} (either alphabet). `null` for corrupt input or when it
 * inflates past `maxDecompressedBytes` (decompression bomb guard for attacker controlled input).
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

export type ImageExtension = "webp" | "png" | "jpeg";

/** Resolves the image format from the file's leading magic bytes; `null` if it is none of the supported formats. */
export function imageExtensionFromMagicBytes(
	bytes: Uint8Array,
): ImageExtension | null {
	const ascii = (start: number, end: number) =>
		String.fromCharCode(...bytes.subarray(start, end));

	if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
		return "webp";
	}

	if (bytes.length > 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") {
		return "png";
	}

	if (
		bytes.length > 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff
	) {
		return "jpeg";
	}

	return null;
}

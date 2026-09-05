import invariant from "~/utils/invariant";

export type ImageExtension = "webp" | "png" | "jpeg";

/** Format is resolved from the magic bytes, not the client-declared mime type, and must be in `allowedExtensions`. */
export function dataUrlToImageBuffer(
	dataUrl: string,
	allowedExtensions: ReadonlyArray<ImageExtension>,
) {
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	const buffer = Buffer.from(base64, "base64");

	const extension = imageExtensionFromMagicBytes(buffer);
	invariant(
		extension && allowedExtensions.includes(extension),
		`Submitted image is not a valid ${allowedExtensions.join(" or ")}`,
	);

	return { buffer, extension };
}

function imageExtensionFromMagicBytes(buffer: Buffer): ImageExtension | null {
	if (
		buffer.length > 12 &&
		buffer.toString("ascii", 0, 4) === "RIFF" &&
		buffer.toString("ascii", 8, 12) === "WEBP"
	) {
		return "webp";
	}

	if (
		buffer.length > 8 &&
		buffer[0] === 0x89 &&
		buffer.toString("ascii", 1, 4) === "PNG"
	) {
		return "png";
	}

	if (
		buffer.length > 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	) {
		return "jpeg";
	}

	return null;
}

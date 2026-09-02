import * as v from "valibot";

/** Unlike the generic `image()` field, art keeps the uploaded format instead of normalizing to webp. */
const ART_IMAGE_DATA_URL_PREFIX_REGEX = /^data:image\/(png|jpeg|webp);base64,/;

/** Decoded bytes. Art is submitted at original resolution, so png needs this much headroom. */
const ART_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Decoded bytes; the client caps the width to `ART.THUMBNAIL_WIDTH`, landing well below this. */
const ART_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/** Fits both data URLs at their maximum plus the rest of the form's fields. */
export const ART_FORM_MAX_BODY_BYTES =
	maxDataUrlLength(ART_IMAGE_MAX_BYTES + ART_THUMBNAIL_MAX_BYTES) + 100_000;

export const ART_IMAGE_TOO_LARGE_ERROR = "forms:errors.imageTooLarge";

const artImageDataUrl = (maxBytes: number) =>
	v.pipe(
		v.string(),
		v.maxLength(maxDataUrlLength(maxBytes), ART_IMAGE_TOO_LARGE_ERROR),
		v.regex(ART_IMAGE_DATA_URL_PREFIX_REGEX),
	);

/**
 * Art can't use the generic `image()` field: it keeps aspect ratio and format and derives a
 * thumbnail, hence two data URLs. `EXISTING` carries only the preview url; art images can't be
 * swapped after upload.
 */
export const artImageValue = v.nullable(
	v.union([
		v.object({
			type: v.literal("EXISTING"),
			url: v.string(),
		}),
		v.object({
			type: v.literal("NEW"),
			dataUrl: artImageDataUrl(ART_IMAGE_MAX_BYTES),
			thumbnailDataUrl: artImageDataUrl(ART_THUMBNAIL_MAX_BYTES),
		}),
	]),
);

export type ArtImageValue = v.InferOutput<typeof artImageValue>;

/** Lets the form field reject an oversized pick right away instead of only on submit. */
export function isArtImageTooLarge({
	dataUrl,
	thumbnailDataUrl,
}: {
	dataUrl: string;
	thumbnailDataUrl: string;
}) {
	return (
		dataUrl.length > maxDataUrlLength(ART_IMAGE_MAX_BYTES) ||
		thumbnailDataUrl.length > maxDataUrlLength(ART_THUMBNAIL_MAX_BYTES)
	);
}

/** Max length of a base64 data URL for `bytes` decoded bytes, prefix included. */
function maxDataUrlLength(bytes: number) {
	return Math.ceil(bytes / 3) * 4 + 32;
}

import * as v from "valibot";

/**
 * Allowed prefixes for an art data URL. Unlike the generic `image()` form field, art keeps the
 * uploaded image's own format instead of normalizing everything to webp.
 */
const ART_IMAGE_DATA_URL_PREFIX_REGEX = /^data:image\/(png|jpeg|webp);base64,/;

/**
 * Largest full-size art image accepted, decoded. Art is submitted at its original resolution and
 * png keeps its detail losslessly, so this needs the same headroom the multipart upload flow used
 * to allow.
 */
const ART_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Largest art thumbnail accepted, decoded. The client caps the thumbnail's width to
 * `ART.THUMBNAIL_WIDTH`, which lands well below this.
 */
const ART_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Ceiling for the whole art submit body. Fits both data URLs at their maximum plus the rest of the
 * form's fields.
 */
export const ART_FORM_MAX_BODY_BYTES =
	maxDataUrlLength(ART_IMAGE_MAX_BYTES + ART_THUMBNAIL_MAX_BYTES) + 100_000;

/** Error shown when a picked image doesn't fit within the limits above. */
export const ART_IMAGE_TOO_LARGE_ERROR = "forms:errors.imageTooLarge";

const artImageDataUrl = (maxBytes: number) =>
	v.pipe(
		v.string(),
		v.maxLength(maxDataUrlLength(maxBytes), ART_IMAGE_TOO_LARGE_ERROR),
		v.regex(ART_IMAGE_DATA_URL_PREFIX_REGEX),
	);

/**
 * JSON-serializable value of the art image form field. Art can't use the generic `image()` field:
 * it preserves aspect ratio, keeps the original format and derives a separate thumbnail, which is
 * why a `NEW` value carries two data URLs. An `EXISTING` value marks art whose image was already
 * uploaded (only the preview url rides along, never bytes) — art images can't be swapped after
 * upload.
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

/**
 * Does a freshly compressed art image exceed what the schema accepts? Lets the form field reject
 * an oversized pick right away instead of only when the filled-out form is submitted.
 */
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

/** Length a base64 data URL encoding `bytes` decoded bytes can reach, `data:` prefix included. */
function maxDataUrlLength(bytes: number) {
	return Math.ceil(bytes / 3) * 4 + 32;
}

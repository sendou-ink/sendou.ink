import { z } from "zod";
import { id } from "~/utils/zod";

/** Prefix every {@link imageValue} `NEW` data URL must start with (client compresses to webp). */
const IMAGE_FIELD_WEBP_DATA_URL_PREFIX = "data:image/webp;base64,";

/**
 * Hard ceiling for a `NEW` data URL's length. Caps the JSON body size so a malicious or
 * oversized payload can't bloat the request. A `thick-banner` webp base64-encodes to ~200KB,
 * so this leaves comfortable headroom.
 */
const IMAGE_FIELD_MAX_DATA_URL_LENGTH = 3_000_000;

/**
 * JSON-serializable value of a SendouForm `image` field. Covers every state an edit form needs:
 * `null` (none / removed), an unchanged `EXISTING` image (only the id reference + a preview url
 * ride in JSON, never bytes), or a newly picked `NEW` image as a base64 webp data URL.
 */
export const imageValue = z
	.union([
		z.object({
			type: z.literal("EXISTING"),
			imgId: id,
			url: z.string(),
		}),
		z.object({
			type: z.literal("NEW"),
			dataUrl: z
				.string()
				.max(IMAGE_FIELD_MAX_DATA_URL_LENGTH)
				.startsWith(IMAGE_FIELD_WEBP_DATA_URL_PREFIX),
		}),
	])
	.nullable();

export type ImageFieldValue = z.infer<typeof imageValue>;

/**
 * Builds an `EXISTING` {@link ImageFieldValue} for an edit form's default values, or `null`
 * when either the id or preview url is missing.
 */
export function existingImage(
	imgId: number | null | undefined,
	url: string | null | undefined,
): ImageFieldValue {
	return imgId && url ? { type: "EXISTING", imgId, url } : null;
}

export type ImageFieldDimensions =
	| "logo"
	| "thick-banner"
	| { width: number; height: number };

const IMAGE_FIELD_DIMENSION_PRESETS = {
	logo: { width: 400, height: 400 },
	"thick-banner": { width: 1000, height: 500 },
} as const;

/** Resolves an `image` field's `dimensions` (preset name or explicit numbers) to a `{ width, height }`. */
export function resolveImageFieldDimensions(
	dimensions?: ImageFieldDimensions,
): {
	width: number;
	height: number;
} {
	if (!dimensions || typeof dimensions === "string") {
		return IMAGE_FIELD_DIMENSION_PRESETS[dimensions ?? "logo"];
	}

	return dimensions;
}

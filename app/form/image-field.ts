import * as v from "valibot";
import { id } from "~/utils/schema";

/** The client compresses to webp, but browsers without canvas webp encoding (Safari, Brave) silently fall back to png. */
const IMAGE_FIELD_DATA_URL_PREFIX_REGEX = /^data:image\/(webp|png);base64,/;

/** Caps the JSON body size; a `thick-banner` webp base64-encodes to ~200KB, so this leaves comfortable headroom. */
const IMAGE_FIELD_MAX_DATA_URL_LENGTH = 3_000_000;

/** `null` (none / removed), an unchanged `EXISTING` image (id + preview url, never bytes), or a `NEW` base64 webp/png data URL. */
export const imageValue = v.nullable(
	v.union([
		v.object({
			type: v.literal("EXISTING"),
			imgId: id,
			url: v.string(),
		}),
		v.object({
			type: v.literal("NEW"),
			dataUrl: v.pipe(
				v.string(),
				v.maxLength(IMAGE_FIELD_MAX_DATA_URL_LENGTH),
				v.regex(IMAGE_FIELD_DATA_URL_PREFIX_REGEX),
			),
		}),
	]),
);

export type ImageFieldValue = v.InferOutput<typeof imageValue>;

/** `EXISTING` {@link ImageFieldValue} for an edit form's defaults, or `null` when the id or preview url is missing. */
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

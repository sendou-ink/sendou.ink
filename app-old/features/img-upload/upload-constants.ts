import type { ImageUploadType } from "./upload-types";

export const MAX_UNVALIDATED_IMG_COUNT = 5;

export const IMAGE_TYPES = ["team-pfp", "org-pfp", "team-banner"] as const;

export const imgTypeToDimensions: Record<
	ImageUploadType,
	{ width: number; height: number }
> = {
	"team-pfp": { width: 400, height: 400 },
	"org-pfp": { width: 400, height: 400 },
	"team-banner": { width: 1000, height: 500 },
};

export const imgTypeToStyle: Record<ImageUploadType, React.CSSProperties> = {
	"team-pfp": { borderRadius: "100%", width: "144px", height: "144px" },
	"org-pfp": { borderRadius: "100%", width: "144px", height: "144px" },
	"team-banner": { borderRadius: "var(--rounded)", width: "100%" },
};

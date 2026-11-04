export const SPLATOON_ROTATION_TYPES = ["X", "SERIES", "OPEN"] as const;

export type SplatoonRotationType = (typeof SPLATOON_ROTATION_TYPES)[number];

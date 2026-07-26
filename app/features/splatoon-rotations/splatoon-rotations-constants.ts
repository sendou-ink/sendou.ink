export const SPLATOON_ROTATION_TYPES = ["SERIES", "OPEN", "X"] as const;

export type SplatoonRotationType = (typeof SPLATOON_ROTATION_TYPES)[number];

export const PLUS_TIERS = [1, 2, 3] as const;

export type PlusTier = (typeof PLUS_TIERS)[number];

export const PLUS_SUGGESTION = {
	TEXT_MAX_LENGTH: 500,
	FOLLOW_UP_COMMENT_MAX_LENGTH: 280,
};

export const ZERO_SUGGESTION_COUNTS: Record<PlusTier, number> = {
	1: 0,
	2: 0,
	3: 0,
};

export function isPlusTier(tier: number): tier is PlusTier {
	return PLUS_TIERS.some((plusTier) => plusTier === tier);
}

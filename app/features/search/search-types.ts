export const SEARCH_TYPES = [
	"users",
	"teams",
	"organizations",
	"tournaments",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

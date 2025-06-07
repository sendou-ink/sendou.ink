import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";

export const MAX_BUILD_FILTERS = 6;

export const FILTER_SEARCH_PARAM_KEY = "f";

export const PATCHES = [
	{
		patch: "9.3.0",
		date: "2025-03-13",
	},
	{
		patch: "9.2.0",
		date: "2024-11-20",
	},
	{
		patch: "9.0.0",
		date: "2024-08-29",
	},
	// {
	// 	patch: "8.1.0",
	// 	date: "2024-07-17",
	// },
	// {
	// 	patch: "8.0.0",
	// 	date: "2024-05-31",
	// },
	// {
	// 	patch: "7.2.0",
	// 	date: "2024-04-17",
	// },
	// {
	// 	patch: "7.0.0",
	// 	date: "2024-02-21",
	// },
	// {
	//   patch: "6.1.0",
	//   date: "2024-01-24",
	// },
	// {
	//   patch: "6.0.0",
	//   date: "2023-11-29",
	// },
	// {
	//   patch: "5.1.0",
	//   date: "2023-10-17",
	// },
	// {
	//   patch: "5.0.0",
	//   date: "2023-08-30",
	// },
];

export const BUILD = {
	TITLE_MIN_LENGTH: 1,
	TITLE_MAX_LENGTH: 50,
	DESCRIPTION_MAX_LENGTH: 280,
	MAX_WEAPONS_COUNT: 5,
	MAX_COUNT: 250,
} as const;

export const BUILDS_PAGE_BATCH_SIZE = 24;
export const BUILDS_PAGE_MAX_BUILDS = 240;

export const EMPTY_BUILD: BuildAbilitiesTupleWithUnknown = [
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
	["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
];

import type { Tables } from "~/db/tables";
import type { ModeShort, RankedModeShort } from "~/modules/in-game-lists/types";
import { topSearchSearchParams } from "./top-search-search-params";

export const topSearchPage = (args?: {
	month: number;
	year: number;
	mode: ModeShort;
	region: Tables["XRankPlacement"]["region"];
}) =>
	args
		? topSearchSearchParams.href("/xsearch", {
				...args,
				mode: args.mode as RankedModeShort,
			})
		: "/xsearch";

export const topSearchPlayerPage = (playerId: number) =>
	`${topSearchPage()}/player/${playerId}`;

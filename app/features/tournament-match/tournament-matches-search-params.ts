import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { codec, SP } from "~/modules/search-params/search-params";

export const TOURNAMENT_MATCHES_TABS = [
	"scheduled",
	"unscheduled",
	"past",
] as const;

export type TournamentMatchesTab = (typeof TOURNAMENT_MATCHES_TABS)[number];

export const ALL_DIVISIONS = "all";

const divisionCodec = codec(
	v.nullable(
		v.union([
			v.literal(ALL_DIVISIONS),
			v.pipe(v.number(), v.integer(), v.minValue(0)),
		]),
	),
	{
		decode: (value) =>
			value === ALL_DIVISIONS || value.trim() === "" ? value : Number(value),
		encode: (value) => String(value),
	},
);

export const tournamentMatchesSearchParams = SearchParams.define({
	tab: SP.param(v.picklist(TOURNAMENT_MATCHES_TABS), {
		default: "scheduled",
		loader: false,
	}),
	/** Starting bracket idx of the league division whose sets are listed, or every division; null resolves to the viewer's own division or the first one. */
	division: SP.custom(divisionCodec, {
		default: null,
		loader: true,
	}),
});

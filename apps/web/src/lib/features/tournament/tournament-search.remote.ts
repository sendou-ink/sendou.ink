import type { Unwrapped } from "@sendou/utils/types";
import * as v from "valibot";
import { getUser } from "#lib/features/auth/user.server.ts";
import { query } from "$app/server";
import * as TournamentRepository from "./TournamentRepository.server.ts";

export type TournamentSearchItem = Unwrapped<
	typeof TournamentRepository.searchByName
>;

// remote query args travel via devalue, so Date instances survive as-is
const tournamentSearchSchema = v.object({
	q: v.pipe(v.string(), v.maxLength(100)),
	limit: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
		6,
	),
	minStartTime: v.nullish(v.date(), null),
	maxStartTime: v.nullish(v.date(), null),
});

export const searchTournaments = query(
	tournamentSearchSchema,
	async ({ q, limit, minStartTime, maxStartTime }) => {
		const user = getUser();
		if (!user || !q) {
			return { tournaments: [] as TournamentSearchItem[], query: q };
		}

		return {
			tournaments: await TournamentRepository.searchByName({
				query: q,
				limit,
				minStartTime: minStartTime ?? undefined,
				maxStartTime: maxStartTime ?? undefined,
			}),
			query: q,
		};
	},
);

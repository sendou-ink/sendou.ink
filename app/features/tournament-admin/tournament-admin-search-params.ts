import * as v from "valibot";
import { TOURNAMENT_AUDIT_LOG_TYPES } from "~/features/tournament/tournament-constants";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentAuditSearchParams = SearchParams.define({
	page: SP.page(),
	auditType: SP.param(v.nullable(v.picklist(TOURNAMENT_AUDIT_LOG_TYPES)), {
		loader: true,
		resets: ["page"],
	}),
	auditTeam: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{
			loader: true,
			resets: ["page"],
		},
	),
});

export const tournamentImportTeamsSearchParams = SearchParams.define({
	fromTournamentId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{
			loader: true,
		},
	),
});

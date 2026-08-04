import { z } from "zod";
import { TOURNAMENT_AUDIT_LOG_TYPES } from "~/features/tournament/tournament-constants";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const tournamentAuditSearchParams = SearchParams.define({
	page: SP.page(),
	auditType: SP.param(z.enum(TOURNAMENT_AUDIT_LOG_TYPES).nullable(), {
		loader: true,
		resets: ["page"],
	}),
	auditTeam: SP.param(z.number().int().positive().nullable(), {
		loader: true,
		resets: ["page"],
	}),
});

export const tournamentImportTeamsSearchParams = SearchParams.define({
	fromTournamentId: SP.param(z.number().int().positive().nullable(), {
		loader: true,
	}),
});

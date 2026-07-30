import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import { AUDIT_LOG_PAGE_SIZE } from "~/features/tournament/TournamentAuditLogRepository.server";
import { TOURNAMENT_AUDIT_LOG_TYPES } from "~/features/tournament/tournament-constants";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import {
	forbidden,
	paginate,
	parseParams,
	parseSearchParams,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

const auditSearchParamsSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	auditType: z.enum(TOURNAMENT_AUDIT_LOG_TYPES).optional().catch(undefined),
	auditTeam: z.coerce.number().int().optional().catch(undefined),
});

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	if (!tournament.isOrganizer(user)) forbidden();

	const { page, auditType, auditTeam } = parseSearchParams({
		request,
		schema: auditSearchParamsSchema,
	});

	const [events, totalCount, teams] = await Promise.all([
		TournamentAuditLogRepository.findByTournamentId({
			tournamentId,
			type: auditType,
			tournamentTeamHistoryId: auditTeam,
			limit: AUDIT_LOG_PAGE_SIZE,
			offset: (page - 1) * AUDIT_LOG_PAGE_SIZE,
		}),
		TournamentAuditLogRepository.countByTournamentId({
			tournamentId,
			type: auditType,
			tournamentTeamHistoryId: auditTeam,
		}),
		TournamentAuditLogRepository.findTeamsByTournamentId(tournamentId),
	]);

	return {
		auditLog: {
			events,
			teams,
			...paginate({ url, page, pageSize: AUDIT_LOG_PAGE_SIZE, totalCount }),
		},
	};
};

export type TournamentAdminAuditLoader = typeof loader;

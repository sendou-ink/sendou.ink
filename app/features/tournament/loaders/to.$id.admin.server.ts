import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { TOURNAMENT_AUDIT_LOG_TYPES } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import { AUDIT_LOG_PAGE_SIZE } from "~/features/tournament/TournamentAuditLogRepository.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import {
	parseParams,
	parseSearchParams,
	redirectIfPageOutOfBounds,
} from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

// xxx: extract to different file
const auditSearchParamsSchema = z.object({
	tab: z.string().optional().catch(undefined),
	page: z.coerce.number().int().min(1).catch(1),
	auditType: z.enum(TOURNAMENT_AUDIT_LOG_TYPES).optional().catch(undefined),
	auditTeam: z.coerce.number().int().optional().catch(undefined),
});

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	if (!tournament.isOrganizer(user)) return null;

	const { tab, page, auditType, auditTeam } = parseSearchParams({
		request,
		schema: auditSearchParamsSchema,
	});

	// xxx: probably just make proper different routes?
	// the audit log is paginated server-side, so only fetch it for its own tab
	if (tab !== "audit") return { auditLog: null };

	const [events, totalCount, teams] = await Promise.all([
		TournamentAuditLogRepository.findByTournamentId({
			tournamentId,
			type: auditType,
			tournamentTeamId: auditTeam,
			limit: AUDIT_LOG_PAGE_SIZE,
			offset: (page - 1) * AUDIT_LOG_PAGE_SIZE,
		}),
		TournamentAuditLogRepository.countByTournamentId({
			tournamentId,
			type: auditType,
			tournamentTeamId: auditTeam,
		}),
		TournamentAuditLogRepository.findTeamsByTournamentId(tournamentId),
	]);

	const pagesCount = Math.max(1, Math.ceil(totalCount / AUDIT_LOG_PAGE_SIZE));

	redirectIfPageOutOfBounds({ request, page, pagesCount });

	return {
		auditLog: {
			events,
			teams,
			currentPage: page,
			pagesCount,
		},
	};
};

export type TournamentAdminPageLoader = typeof loader;

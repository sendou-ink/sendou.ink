import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import { AUDIT_LOG_PAGE_SIZE } from "~/features/tournament/TournamentAuditLogRepository.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import { forbidden, paginate, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { tournamentAuditSearchParams } from "../tournament-admin-search-params";

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({ tournamentId, user });
	if (!tournament.isOrganizer(user)) forbidden();

	const { page, auditType, auditTeam } =
		tournamentAuditSearchParams.parse(request);

	const [events, totalCount, teams] = await Promise.all([
		TournamentAuditLogRepository.findByTournamentId({
			tournamentId,
			type: auditType ?? undefined,
			tournamentTeamHistoryId: auditTeam ?? undefined,
			limit: AUDIT_LOG_PAGE_SIZE,
			offset: (page - 1) * AUDIT_LOG_PAGE_SIZE,
		}),
		TournamentAuditLogRepository.countByTournamentId({
			tournamentId,
			type: auditType ?? undefined,
			tournamentTeamHistoryId: auditTeam ?? undefined,
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

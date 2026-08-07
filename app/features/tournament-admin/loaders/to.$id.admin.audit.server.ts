import type { LoaderFunctionArgs } from "react-router";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import { AUDIT_LOG_PAGE_SIZE } from "~/features/tournament/TournamentAuditLogRepository.server";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { paginate } from "~/utils/remix.server";
import { tournamentAuditSearchParams } from "../tournament-admin-search-params";

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, {
		for: "organizer",
	});

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

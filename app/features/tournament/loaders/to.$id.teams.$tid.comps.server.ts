import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as RunComps from "~/features/img-export/core/RunComps";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentTeamPageParamsSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { forbidden, parseParams } from "~/utils/remix.server";

export type TournamentTeamCompsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId, tid: tournamentTeamId } = parseParams({
		params,
		schema: tournamentTeamPageParamsSchema,
	});

	const tournament = await tournamentDataCached(tournamentId);
	const team = tournament?.ctx.teams.find(
		(team) => team.id === tournamentTeamId,
	);
	if (!tournament || !team) {
		throw new Response(null, { status: 404 });
	}

	if (!team.memberUserIds.includes(user.id)) {
		throw forbidden();
	}

	const minMembersPerTeam = tournament.ctx.settings.minMembersPerTeam ?? 4;

	const teamIdByUserId = new Map<number, number>();
	for (const team of tournament.ctx.teams) {
		for (const userId of team.memberUserIds) {
			teamIdByUserId.set(userId, team.id);
		}
	}

	const sets =
		await TournamentMatchRepository.findByTournamentTeamId(tournamentTeamId);

	const ownObservations: RunComps.CompObservation[] = [];
	const opponentComps: Array<{
		tournamentMatchId: number;
		comp: MainWeaponId[];
	}> = [];
	let mapOrderOffset = 0;

	for (const set of sets) {
		const reported =
			(await ReportedWeaponRepository.findByTournamentMatchId(
				set.tournamentMatchId,
			)) ?? [];
		const scoreboards =
			await ScannerIngestRepository.findScoreboardsByTournamentMatchId(
				set.tournamentMatchId,
			);

		const opponentObservations: RunComps.CompObservation[] = [];

		for (let mapIndex = 0; mapIndex < set.matches.length; mapIndex++) {
			const mapOrder = mapOrderOffset + mapIndex;
			const ingestedPlayers =
				scoreboards.find((scoreboard) => scoreboard.mapIndex === mapIndex)?.data
					.players ?? [];
			const reportedForMap = reported.filter(
				(row) => row.mapIndex === mapIndex,
			);

			const observationsFor = (teamId: number) =>
				RunComps.mapObservations({
					mapOrder,
					reported: reportedForMap.filter(
						(row) => teamIdByUserId.get(row.userId) === teamId,
					),
					ingested: ingestedPlayers.filter(
						(player) => player.tournamentTeamId === teamId,
					),
				});

			ownObservations.push(...observationsFor(tournamentTeamId));
			opponentObservations.push(...observationsFor(set.otherTeamId));
		}

		mapOrderOffset += set.matches.length;

		opponentComps.push({
			tournamentMatchId: set.tournamentMatchId,
			comp: fullCompOnly(RunComps.buildComp(opponentObservations)),
		});
	}

	return {
		ownComp: fullCompOnly(RunComps.buildComp(ownObservations)),
		opponentComps,
	};

	function fullCompOnly(comp: MainWeaponId[]) {
		return comp.length >= minMembersPerTeam ? comp : [];
	}
};

/**
 * Team comps from the montage's own scans: every scoreboard a VoD read names
 * both sides' weapons, and the POV seat tells which side is the streamer's
 * team. The comp is built as the results image export builds it
 * (`RunComps`).
 */
import * as RunComps from "~/features/img-export/core/RunComps";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type {
	MontageGame,
	MontageLineupPlayer,
	MontageManifestVod,
} from "../core/montage";

const COMP_SIZE = 4;

/**
 * Comps by team id; a team is only in it with a full comp. `games` are by
 * VoD file name, in play order within a VoD.
 */
export function scannedTeamComps(
	vods: readonly MontageManifestVod[],
	games: ReadonlyMap<string, readonly MontageGame[]>,
): Map<number, MainWeaponId[]> {
	const observations = new Map<number, RunComps.CompObservation[]>();
	const observe = (
		teamId: number,
		players: readonly MontageLineupPlayer[],
		mapOrder: number,
	) => {
		const teamObservations = observations.get(teamId) ?? [];
		for (const [slot, player] of players.entries()) {
			if (player.weaponId === null) continue;
			teamObservations.push({
				playerKey: player.name ?? `slot-${slot}`,
				weaponSplId: player.weaponId,
				mapOrder,
			});
		}
		observations.set(teamId, teamObservations);
	};

	for (const vod of vods) {
		const povTeamId = vod.team?.id;
		if (povTeamId === undefined) continue;
		const opponentId = vod.teams.find((team) => team.id !== povTeamId)?.id;
		for (const [index, game] of (games.get(vod.file) ?? []).entries()) {
			if (!game.lineups) continue;
			const mapOrder = vod.matchId * 100 + index;
			observe(povTeamId, game.lineups.pov, mapOrder);
			if (opponentId !== undefined) {
				observe(opponentId, game.lineups.opponent, mapOrder);
			}
		}
	}

	const comps = new Map<number, MainWeaponId[]>();
	for (const [teamId, teamObservations] of observations) {
		const comp = RunComps.buildComp(teamObservations);
		if (comp.length >= COMP_SIZE) comps.set(teamId, comp);
	}
	return comps;
}

import type { TFunction } from "i18next";
import { CHANNEL_PREFIX } from "~/features/events/events-types";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";

export const tournamentMatchChannel = (matchId: number) =>
	`${CHANNEL_PREFIX.tournamentMatch}${matchId}`;

export function resolveHostingTeam(
	teams: [TournamentDataTeam, TournamentDataTeam],
) {
	if (teams[0].prefersNotToHost && !teams[1].prefersNotToHost) return teams[1];
	if (!teams[0].prefersNotToHost && teams[1].prefersNotToHost) return teams[0];
	if (!teams[0].seed && !teams[1].seed) return teams[0];
	if (!teams[0].seed) return teams[1];
	if (!teams[1].seed) return teams[0];
	if (teams[0].seed < teams[1].seed) return teams[0];
	if (teams[1].seed < teams[0].seed) return teams[1];

	logger.error("resolveHostingTeam: unexpected default");
	return teams[0];
}

export function matchIsLocked({
	tournament,
	matchId,
	scores,
}: {
	tournament: Tournament;
	matchId: number;
	scores: [number, number];
}) {
	if (scores[0] !== 0 || scores[1] !== 0) return false;

	return tournament.isMatchLockedForCast(matchId);
}

export function pickInfoText({
	map,
	t,
	teams,
}: {
	map?: { stageId: StageId; mode: ModeShort; source: TournamentMaplistSource };
	t: TFunction<["tournament"]>;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	if (!map) return "";

	if (map.source === teams[0].id) {
		return t("tournament:pickInfo.team", { number: 1 });
	}
	if (map.source === teams[1].id) {
		return t("tournament:pickInfo.team", { number: 2 });
	}
	if (map.source === "RANDOM") {
		return t("tournament:pickInfo.random");
	}
	if (map.source === "BOTH") return t("tournament:pickInfo.both");
	if (map.source === "DEFAULT") return t("tournament:pickInfo.default");
	if (map.source === "COUNTERPICK") {
		return t("tournament:pickInfo.counterpick");
	}
	if (map.source === "ROLL") {
		return t("tournament:pickInfo.roll");
	}
	if (map.source === "TO") return "";

	logger.error(`Unknown source: ${String(map.source)}`);
	return "";
}

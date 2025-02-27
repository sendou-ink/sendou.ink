import type { TFunction } from "i18next";
import type { TournamentRoundMaps } from "~/db/tables";
import type { TournamentMatch } from "~/db/types";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator";
import {
	seededRandom,
	sourceTypes,
} from "~/modules/tournament-map-list-generator";
import { removeDuplicates } from "~/utils/arrays";
import { sumArray } from "~/utils/number";
import type { FindMatchById } from "../tournament-bracket/queries/findMatchById.server";
import type { TournamentLoaderData } from "../tournament/routes/to.$id";
import type { Standing } from "./core/Bracket";
import type { Tournament } from "./core/Tournament";
import type { TournamentDataTeam } from "./core/Tournament.server";

const NUM_MAP = {
	"1": ["1", "2", "4"],
	"2": ["2", "1", "3", "5"],
	"3": ["3", "2", "6"],
	"4": ["4", "1", "5", "7"],
	"5": ["5", "2", "4", "6", "8"],
	"6": ["6", "3", "5", "9"],
	"7": ["7", "4", "8"],
	"8": ["8", "7", "5", "9", "0"],
	"9": ["9", "6", "8"],
	"0": ["0", "8"],
};
export function resolveRoomPass(matchId: TournamentMatch["id"]) {
	let pass = "5";
	for (let i = 0; i < 3; i++) {
		const { shuffle } = seededRandom(`${matchId}-${i}`);

		const key = pass[i] as keyof typeof NUM_MAP;
		const opts = NUM_MAP[key];
		const next = shuffle(opts)[0];
		pass += next;
	}

	// prevent 5555 since many use it as a default pass
	// making it a bit more common guess
	if (pass === "5555") return "5800";

	return pass;
}

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

	console.error("resolveHostingTeam: unexpected default");
	return teams[0];
}

export function mapCountPlayedInSetWithCertainty({
	bestOf,
	scores,
}: {
	bestOf: number;
	scores: [number, number];
}) {
	const maxScore = Math.max(...scores);
	const scoreSum = scores.reduce((acc, curr) => acc + curr, 0);

	return scoreSum + (Math.ceil(bestOf / 2) - maxScore);
}

export function checkSourceIsValid({
	source,
	match,
}: {
	source: string;
	match: NonNullable<FindMatchById>;
}) {
	if (sourceTypes.includes(source as any)) return true;

	const asTeamId = Number(source);

	if (match.opponentOne?.id === asTeamId) return true;
	if (match.opponentTwo?.id === asTeamId) return true;

	return false;
}

export function bracketSubscriptionKey(tournamentId: number) {
	return `BRACKET_CHANGED_${tournamentId}`;
}

export function matchSubscriptionKey(matchId: number) {
	return `MATCH_CHANGED_${matchId}`;
}

export function fillWithNullTillPowerOfTwo<T>(arr: T[]) {
	const nextPowerOfTwo = 2 ** Math.ceil(Math.log2(arr.length));
	const nullsToAdd = nextPowerOfTwo - arr.length;

	return [...arr, ...new Array(nullsToAdd).fill(null)];
}

export function everyMatchIsOver(
	bracket: Pick<TournamentManagerDataSet, "match">,
) {
	// winners, losers & grand finals+bracket reset are all different stages
	const isDoubleElimination =
		removeDuplicates(bracket.match.map((match) => match.group_id)).length === 3;

	// tournament didn't start yet
	if (bracket.match.length === 0) return false;

	let lastWinner = -1;
	for (const [i, match] of bracket.match.entries()) {
		// special case - bracket reset might not be played depending on who wins in the grands
		const isLast = i === bracket.match.length - 1;
		if (isLast && lastWinner === 1 && isDoubleElimination) {
			continue;
		}
		// BYE
		if (match.opponent1 === null || match.opponent2 === null) {
			continue;
		}
		if (
			match.opponent1?.result !== "win" &&
			match.opponent2?.result !== "win"
		) {
			return false;
		}

		lastWinner = match.opponent1?.result === "win" ? 1 : 2;
	}

	return true;
}

export function everyBracketOver(tournament: TournamentManagerDataSet) {
	const stageIds = tournament.stage.map((stage) => stage.id);

	for (const stageId of stageIds) {
		const matches = tournament.match.filter(
			(match) => match.stage_id === stageId,
		);

		if (!everyMatchIsOver({ match: matches })) {
			return false;
		}
	}

	return true;
}

export const bracketHasStarted = (bracket: TournamentManagerDataSet) =>
	bracket.stage[0] && bracket.stage[0].id !== 0;

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

	const locked = tournament.ctx.castedMatchesInfo?.lockedMatches ?? [];

	return locked.includes(matchId);
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
	if (map.source === "TIEBREAKER") {
		return t("tournament:pickInfo.tiebreaker");
	}
	if (map.source === "BOTH") return t("tournament:pickInfo.both");
	if (map.source === "DEFAULT") return t("tournament:pickInfo.default");
	if (map.source === "COUNTERPICK") {
		return t("tournament:pickInfo.counterpick");
	}
	if (map.source === "TO") return "";

	console.error(`Unknown source: ${String(map.source)}`);
	return "";
}

/**
 * Converts a group number to its corresponding letter representation.
 *
 * The function takes a one-based group number and converts it to a string
 * of uppercase letters, similar to how Excel columns are labeled (e.g., 1 -> 'A', 26 -> 'Z', 27 -> 'AA').
 *
 * @param groupNumber - The one-based group number to convert.
 * @returns The letter representation of the group number.
 */
export function groupNumberToLetters(groupNumber: number) {
	let letters = "";
	let num = groupNumber - 1; // Adjust for one-based input
	while (num >= 0) {
		letters = String.fromCharCode((num % 26) + 65) + letters;
		num = Math.floor(num / 26) - 1;
	}
	return letters;
}

export function isSetOverByResults({
	results,
	count,
	countType,
}: {
	results: Array<{ winnerTeamId: number }>;
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	const winCounts = new Map<number, number>();

	for (const result of results) {
		const count = winCounts.get(result.winnerTeamId) ?? 0;
		winCounts.set(result.winnerTeamId, count + 1);
	}

	if (countType === "PLAY_ALL") {
		return sumArray(Array.from(winCounts.values())) === count;
	}

	const maxWins = Math.max(...Array.from(winCounts.values()));

	// best of
	return maxWins >= Math.ceil(count / 2);
}

export function isSetOverByScore({
	scores,
	count,
	countType,
}: {
	scores: [number, number];
	count: number;
	countType: TournamentRoundMaps["type"];
}) {
	if (countType === "PLAY_ALL") {
		return sumArray(scores) === count;
	}

	const matchOverAtXWins = Math.ceil(count / 2);
	return scores[0] === matchOverAtXWins || scores[1] === matchOverAtXWins;
}

export function tournamentTeamToActiveRosterUserIds(
	team: TournamentLoaderData["tournament"]["ctx"]["teams"][number],
	teamMinMemberCount: number,
) {
	if (
		team.activeRosterUserIds &&
		team.activeRosterUserIds.length === teamMinMemberCount
	) {
		return team.activeRosterUserIds;
	}

	// they don't need to select active roster as they have no subs
	if (team.members.length === teamMinMemberCount) {
		return team.members.map((member) => member.userId);
	}

	return null;
}

// deal with user getting added to multiple teams by the TO
export function ensureOneStandingPerUser(standings: Standing[]) {
	const userIds = new Set<number>();

	return standings.map((standing) => {
		return {
			...standing,
			team: {
				...standing.team,
				members: standing.team.members.filter((member) => {
					if (userIds.has(member.userId)) return false;
					userIds.add(member.userId);
					return true;
				}),
			},
		};
	});
}

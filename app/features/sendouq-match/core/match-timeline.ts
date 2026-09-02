import type { TFunction } from "i18next";
import {
	resolveTimelineScoreboard,
	resolveTimelineWeapons,
} from "~/components/match-page/ingested-scoreboard";
import type {
	TimelineMap,
	TimelineSpChanges,
} from "~/components/match-page/MatchTimeline";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

type MatchData = SendouQMatchLoaderData["match"];

/** Display names of a match's two groups, translated "Group Alpha"/"Group Bravo" for ones without a registered team. */
export function resolveGroupNames(match: MatchData, t: TFunction<["q"]>) {
	return {
		alpha: match.groupAlpha.team?.name ?? t("q:match.groupAlpha"),
		bravo: match.groupBravo.team?.name ?? t("q:match.groupBravo"),
	};
}

export function resolveTimelineTeams(match: MatchData, t: TFunction<["q"]>) {
	const names = resolveGroupNames(match, t);
	return {
		alpha: {
			name: names.alpha,
			avatar: match.groupAlpha.team?.avatarUrl ?? undefined,
		},
		bravo: {
			name: names.bravo,
			avatar: match.groupBravo.team?.avatarUrl ?? undefined,
		},
	};
}

export function resolveTimelineMaps(
	match: MatchData,
	reportedWeapons: SendouQMatchLoaderData["reportedWeapons"],
	ingestedScoreboards: SendouQMatchLoaderData["ingestedScoreboards"],
): TimelineMap[] {
	return match.mapList
		.map((map, mapIndex) => ({ map, mapIndex }))
		.filter(({ map }) => map.winnerGroupId !== null)
		.map(({ map, mapIndex }) => {
			const ingestedScoreboard = ingestedScoreboards.find(
				(scoreboard) => scoreboard.mapIndex === mapIndex,
			);
			const alphaIsWinner = map.winnerGroupId === match.groupAlpha.id;

			const weaponsFor = (
				group: MatchData["groupAlpha"] | MatchData["groupBravo"],
			) =>
				resolveTimelineWeapons({
					linkedWeapons: group.members.map(
						(member) =>
							reportedWeapons?.find(
								(rw) => rw.mapIndex === mapIndex && rw.userId === member.id,
							)?.weaponSplId ?? null,
					),
					ingestedPlayers: ingestedScoreboard?.data.players ?? [],
					tournamentTeamId: group.id,
				});

			const alphaWeapons = weaponsFor(match.groupAlpha);
			const bravoWeapons = weaponsFor(match.groupBravo);

			const hasAnyWeapon =
				alphaWeapons.some((w) => w !== null) ||
				bravoWeapons.some((w) => w !== null);

			return {
				stageId: map.stageId,
				mode: map.mode,
				timestamp: databaseTimestampToJavascriptTimestamp(
					map.reportedAt ?? match.createdAt,
				),
				winner: alphaIsWinner ? ("ALPHA" as const) : ("BRAVO" as const),
				rosters: {
					alpha: match.groupAlpha.members,
					bravo: match.groupBravo.members,
				},
				weapons: hasAnyWeapon
					? { alpha: alphaWeapons, bravo: bravoWeapons }
					: undefined,
				scoreboard: resolveTimelineScoreboard(
					ingestedScoreboard?.data,
					alphaIsWinner,
				),
			};
		});
}

export function resolveTimelineSpChanges(
	match: MatchData,
): TimelineSpChanges | undefined {
	const resolveMembers = (
		group: MatchData["groupAlpha"] | MatchData["groupBravo"],
	) =>
		group.members
			.filter((m) => m.skillDifference)
			.map((m) => ({
				user: {
					id: m.id,
					username: m.username,
					discordId: m.discordId,
					discordAvatar: m.discordAvatar,
					customUrl: m.customUrl,
					customAvatarUrl: m.customAvatarUrl,
				},
				skillDifference: m.skillDifference!,
			}));

	const alphaMembers = resolveMembers(match.groupAlpha);
	const bravoMembers = resolveMembers(match.groupBravo);

	if (
		alphaMembers.length === 0 &&
		bravoMembers.length === 0 &&
		!match.groupAlpha.skillDifference &&
		!match.groupBravo.skillDifference
	) {
		return undefined;
	}

	return {
		alpha: {
			members: alphaMembers,
			skillDifference: match.groupAlpha.skillDifference,
		},
		bravo: {
			members: bravoMembers,
			skillDifference: match.groupBravo.skillDifference,
		},
	};
}

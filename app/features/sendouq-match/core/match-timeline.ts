import type { TFunction } from "i18next";
import type {
	TimelineMap,
	TimelineSpChanges,
} from "~/components/match-page/MatchTimeline";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

type MatchData = SendouQMatchLoaderData["match"];

// xxx: unit test this file

/**
 * Resolves display names for the two groups in a match, falling back to the
 * translated "Group Alpha"/"Group Bravo" labels when a group is not associated
 * with a registered team.
 */
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
): TimelineMap[] {
	return match.mapList
		.filter((m) => m.winnerGroupId !== null)
		.map((map) => {
			const alphaWeapons = match.groupAlpha.members.map((member) => {
				const w = reportedWeapons?.find(
					(rw) => rw.groupMatchMapId === map.id && rw.userId === member.id,
				);
				return w ? w.weaponSplId : null;
			});
			const bravoWeapons = match.groupBravo.members.map((member) => {
				const w = reportedWeapons?.find(
					(rw) => rw.groupMatchMapId === map.id && rw.userId === member.id,
				);
				return w ? w.weaponSplId : null;
			});

			const hasAnyWeapon =
				alphaWeapons.some((w) => w !== null) ||
				bravoWeapons.some((w) => w !== null);

			return {
				stageId: map.stageId,
				mode: map.mode,
				timestamp: match.createdAt,
				winner:
					map.winnerGroupId === match.groupAlpha.id
						? ("ALPHA" as const)
						: ("BRAVO" as const),
				rosters: {
					alpha: match.groupAlpha.members,
					bravo: match.groupBravo.members,
				},
				weapons: hasAnyWeapon
					? { alpha: alphaWeapons, bravo: bravoWeapons }
					: undefined,
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

export function resolveMatchScore(match: MatchData) {
	return {
		alpha: match.mapList.filter((m) => m.winnerGroupId === match.groupAlpha.id)
			.length,
		bravo: match.mapList.filter((m) => m.winnerGroupId === match.groupBravo.id)
			.length,
	};
}

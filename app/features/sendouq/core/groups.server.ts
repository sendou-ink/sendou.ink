import clone from "just-clone";
import type { Tables } from "~/db/tables";
import type { Group } from "~/db/types";
import { TIERS } from "~/features/mmr/mmr-constants";
import { defaultOrdinal } from "~/features/mmr/mmr-utils";
import type {
	SkillTierInterval,
	TieredSkill,
} from "~/features/mmr/tiered.server";
import { modesShort } from "~/modules/in-game-lists";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { FULL_GROUP_SIZE } from "../q-constants";
import type {
	DividedGroups,
	DividedGroupsUncensored,
	GroupExpiryStatus,
	LookingGroup,
	LookingGroupWithInviteCode,
} from "../q-types";
import type { RecentMatchPlayer } from "../queries/findRecentMatchPlayersByUserId.server";
import { mapModePreferencesToModeList } from "./match.server";

export function divideGroups({
	groups,
	ownGroupId,
	likes,
}: {
	groups: LookingGroupWithInviteCode[];
	ownGroupId?: number;
	likes: Pick<
		Tables["GroupLike"],
		"likerGroupId" | "targetGroupId" | "isRechallenge"
	>[];
}): DividedGroupsUncensored {
	let own: LookingGroupWithInviteCode | undefined = undefined;
	const neutral: LookingGroupWithInviteCode[] = [];
	const likesReceived: LookingGroupWithInviteCode[] = [];

	const unneutralGroupIds = new Set<number>();
	for (const like of likes) {
		for (const group of groups) {
			if (group.id === ownGroupId) continue;

			// handles edge case where they liked each other
			// right after each other so the group didn't morph
			// so instead it will look so that the group liked us
			// and there is the option to morph
			if (unneutralGroupIds.has(group.id)) continue;

			if (like.likerGroupId === group.id) {
				likesReceived.push(group);
				if (like.isRechallenge) {
					group.isRechallenge = true;
				}

				unneutralGroupIds.add(group.id);
				break;
			}
			if (like.targetGroupId === group.id) {
				group.isLiked = true;
				if (like.isRechallenge) {
					group.isRechallenge = true;
				}
			}
		}
	}

	for (const group of groups) {
		if (group.id === ownGroupId) {
			own = group;
			continue;
		}

		if (unneutralGroupIds.has(group.id)) continue;

		neutral.push(group);
	}

	return {
		own,
		neutral,
		likesReceived,
	};
}

export function addNoScreenIndicator(
	groups: DividedGroupsUncensored,
): DividedGroupsUncensored {
	const ownGroupFull = groups.own?.members.length === FULL_GROUP_SIZE;
	const ownGroupNoScreen = groups.own?.members.some((m) => m.noScreen);

	const addNoScreenIndicatorIfNeeded = (group: LookingGroupWithInviteCode) => {
		const theirGroupNoScreen = group.members.some((m) => m.noScreen);

		return {
			...group,
			isNoScreen: ownGroupFull && (ownGroupNoScreen || theirGroupNoScreen),
			members: group.members.map((m) => ({ ...m, noScreen: undefined })),
		};
	};

	return {
		own: groups.own
			? {
					...groups.own,
					members: groups.own.members.map((m) => ({
						...m,
						noScreen: undefined,
					})),
				}
			: undefined,
		likesReceived: groups.likesReceived.map(addNoScreenIndicatorIfNeeded),
		neutral: groups.neutral.map(addNoScreenIndicatorIfNeeded),
	};
}

const MIN_PLAYERS_FOR_REPLAY = 3;
export function addReplayIndicator({
	groups,
	recentMatchPlayers,
	userId,
}: {
	groups: DividedGroupsUncensored;
	recentMatchPlayers: RecentMatchPlayer[];
	userId: number;
}): DividedGroupsUncensored {
	if (!recentMatchPlayers.length) return groups;

	const ownGroupId = recentMatchPlayers.find(
		(u) => u.userId === userId,
	)?.groupId;
	invariant(ownGroupId, "own group not found");
	const otherGroupId = recentMatchPlayers.find(
		(u) => u.groupId !== ownGroupId,
	)?.groupId;
	invariant(otherGroupId, "other group not found");

	const opponentPlayers = recentMatchPlayers
		.filter((u) => u.groupId === otherGroupId)
		.map((p) => p.userId);

	const addReplayIndicatorIfNeeded = (group: LookingGroupWithInviteCode) => {
		const samePlayersCount = group.members.reduce(
			(acc, cur) => (opponentPlayers.includes(cur.id) ? acc + 1 : acc),
			0,
		);

		return { ...group, isReplay: samePlayersCount >= MIN_PLAYERS_FOR_REPLAY };
	};

	return {
		own: groups.own,
		likesReceived: groups.likesReceived.map(addReplayIndicatorIfNeeded),
		neutral: groups.neutral.map(addReplayIndicatorIfNeeded),
	};
}

export function addFutureMatchModes(
	groups: DividedGroupsUncensored,
): DividedGroupsUncensored {
	const ownModePreferences =
		groups.own?.mapModePreferences?.map((p) => p.modes) ?? [];

	const combinedMatchModes = (group: LookingGroupWithInviteCode) => {
		const theirModePreferences = group.mapModePreferences?.map((p) => p.modes);
		if (!theirModePreferences) return;

		return mapModePreferencesToModeList(
			ownModePreferences,
			theirModePreferences,
		).sort((a, b) => modesShort.indexOf(a) - modesShort.indexOf(b));
	};

	const oneGroupMatchModes = (group: LookingGroupWithInviteCode) => {
		const modePreferences = group.mapModePreferences?.map((p) => p.modes);
		if (!modePreferences) return;

		return mapModePreferencesToModeList(modePreferences, []).sort(
			(a, b) => modesShort.indexOf(a) - modesShort.indexOf(b),
		);
	};

	const removeRechallengeIfIdentical = (group: LookingGroupWithInviteCode) => {
		if (!group.futureMatchModes || !group.rechallengeMatchModes) return group;

		return {
			...group,
			rechallengeMatchModes:
				group.futureMatchModes.length === group.rechallengeMatchModes.length &&
				group.futureMatchModes.every(
					(m, i) => m === group.rechallengeMatchModes![i],
				)
					? undefined
					: group.rechallengeMatchModes,
		};
	};

	return {
		own: groups.own,
		likesReceived: groups.likesReceived.map((g) => ({
			...g,
			futureMatchModes:
				g.isRechallenge && groups.own
					? oneGroupMatchModes(groups.own)
					: combinedMatchModes(g),
		})),
		neutral: groups.neutral
			.map((g) => ({
				...g,
				futureMatchModes: g.isRechallenge
					? oneGroupMatchModes(g)
					: combinedMatchModes(g),
				rechallengeMatchModes: g.isLiked ? oneGroupMatchModes(g) : undefined,
			}))
			.map(removeRechallengeIfIdentical),
	};
}

const censorGroupFully = ({
	inviteCode: _inviteCode,
	mapModePreferences: _mapModePreferences,
	...group
}: LookingGroupWithInviteCode): LookingGroup => ({
	...group,
	members: undefined,
});
const censorGroupPartly = ({
	inviteCode: _inviteCode,
	mapModePreferences: _mapModePreferences,
	...group
}: LookingGroupWithInviteCode): LookingGroup => group;
export function censorGroups({
	groups,
	showInviteCode,
}: {
	groups: DividedGroupsUncensored;
	showInviteCode: boolean;
}): DividedGroups {
	return {
		own:
			showInviteCode || !groups.own
				? groups.own
				: censorGroupPartly(groups.own),
		neutral: groups.neutral.map((g) =>
			g.members.length === FULL_GROUP_SIZE
				? censorGroupFully(g)
				: censorGroupPartly(g),
		),
		likesReceived: groups.likesReceived.map((g) =>
			g.members.length === FULL_GROUP_SIZE
				? censorGroupFully(g)
				: censorGroupPartly(g),
		),
	};
}

export function sortGroupsBySkillAndSentiment({
	groups,
	userSkills,
	intervals,
	userId,
}: {
	groups: DividedGroups;
	userSkills: Record<string, TieredSkill>;
	intervals: SkillTierInterval[];
	userId?: number;
}): DividedGroups {
	const ownGroupTier = () => {
		if (groups.own?.tier?.name) return groups.own.tier.name;
		if (groups.own) {
			return resolveGroupSkill({
				group: groups.own as LookingGroupWithInviteCode,
				userSkills,
				intervals,
			})?.name;
		}

		// preview mode, BRONZE as some kind of sensible defaults for unranked folks
		return userSkills[String(userId)]?.tier?.name ?? "BRONZE";
	};
	const ownGroupTierIndex = TIERS.findIndex((t) => t.name === ownGroupTier());

	const tierDiff = (otherGroupTierName?: string) => {
		if (!otherGroupTierName) return 10;

		const otherGroupTierIndex = TIERS.findIndex(
			(t) => t.name === otherGroupTierName,
		);

		return Math.abs(ownGroupTierIndex - otherGroupTierIndex);
	};

	const groupSentiment = (group: LookingGroup) => {
		if (group.members?.some((m) => m.privateNote?.sentiment === "NEGATIVE")) {
			return "NEGATIVE";
		}

		if (group.members?.some((m) => m.privateNote?.sentiment === "POSITIVE")) {
			return "POSITIVE";
		}

		return "NEUTRAL";
	};

	return {
		...groups,
		neutral: groups.neutral.sort((a, b) => {
			const aSentiment = groupSentiment(a);
			const bSentiment = groupSentiment(b);

			if (aSentiment !== bSentiment) {
				if (aSentiment === "NEGATIVE") return 1;
				if (bSentiment === "NEGATIVE") return -1;
				if (aSentiment === "POSITIVE") return -1;
				if (bSentiment === "POSITIVE") return 1;
			}

			const aDiff = a.tierRange?.diff ?? 0;
			const bDiff = b.tierRange?.diff ?? 0;

			if (aDiff || bDiff) {
				return aDiff - bDiff;
			}

			const aTier =
				a.tier?.name ??
				resolveGroupSkill({
					group: a as LookingGroupWithInviteCode,
					userSkills,
					intervals,
				})?.name;
			const bTier =
				b.tier?.name ??
				resolveGroupSkill({
					group: b as LookingGroupWithInviteCode,
					userSkills,
					intervals,
				})?.name;

			const aTierDiff = tierDiff(aTier);
			const bTierDiff = tierDiff(bTier);

			// if same tier difference, show newer groups first
			if (aTierDiff === bTierDiff) {
				return b.createdAt - a.createdAt;
			}

			// show groups with smaller tier difference first
			return aTierDiff - bTierDiff;
		}),
	};
}

export function addSkillsToGroups({
	groups,
	userSkills,
	intervals,
}: {
	groups: DividedGroupsUncensored;
	userSkills: Record<string, TieredSkill>;
	intervals: SkillTierInterval[];
}): DividedGroupsUncensored {
	const addSkill = (group: LookingGroupWithInviteCode) => ({
		...group,
		members: group.members?.map((m) => {
			const skill = userSkills[String(m.id)];

			return {
				...m,
				skill: !skill || skill.approximate ? ("CALCULATING" as const) : skill,
			};
		}),
		tier:
			group.members.length === FULL_GROUP_SIZE
				? resolveGroupSkill({ group, userSkills, intervals })
				: undefined,
	});

	return {
		own: groups.own ? addSkill(groups.own) : undefined,
		neutral: groups.neutral.map(addSkill),
		likesReceived: groups.likesReceived.map(addSkill),
	};
}

const FALLBACK_TIER = { isPlus: false, name: "IRON" } as const;
export function addSkillRangeToGroups({
	groups,
	hasLeviathan,
	isPreview,
}: {
	groups: DividedGroups;
	hasLeviathan: boolean;
	isPreview: boolean;
}): DividedGroups {
	const addRange = (group: LookingGroup) => {
		if (group.members && group.members.length !== FULL_GROUP_SIZE) return group;

		if (isPreview) {
			return {
				...group,
				tierRange: {
					range: [
						{ name: "IRON", isPlus: false },
						{ name: "LEVIATHAN", isPlus: true },
					] as [TieredSkill["tier"], TieredSkill["tier"]],
					diff: 0,
				},
				tier: undefined,
			};
		}

		const range = tierDifferenceToRangeOrExact({
			ourTier: groups.own?.tier ?? FALLBACK_TIER,
			theirTier: group.tier ?? FALLBACK_TIER,
			hasLeviathan,
		});

		if (!Array.isArray(range.tier)) {
			return {
				...group,
				tierRange: { diff: range.diff },
			};
		}

		return {
			...group,
			tierRange: { range: range.tier, diff: range.diff },
			tier: undefined,
		};
	};

	return {
		own: groups.own,
		neutral: groups.neutral.map(addRange),
		likesReceived: groups.likesReceived.map(addRange),
	};
}

export function membersNeededForFull(currentSize: number) {
	return FULL_GROUP_SIZE - currentSize;
}

function resolveGroupSkill({
	group,
	userSkills,
	intervals,
}: {
	group: LookingGroupWithInviteCode;
	userSkills: Record<string, TieredSkill>;
	intervals: SkillTierInterval[];
}): TieredSkill["tier"] | undefined {
	if (!group.members) return;

	const skills = group.members.map(
		(m) => userSkills[String(m.id)] ?? { ordinal: defaultOrdinal() },
	);

	const averageOrdinal =
		skills.reduce((acc, s) => acc + s.ordinal, 0) / skills.length;

	return (
		intervals.find(
			(i) => i.neededOrdinal && averageOrdinal > i.neededOrdinal,
		) ?? { isPlus: false, name: "IRON" }
	);
}

export function groupExpiryStatus(
	group?: Pick<Group, "latestActionAt">,
): null | GroupExpiryStatus {
	if (!group) return null;

	// group expires in 30min without actions performed
	const groupExpiresAt =
		databaseTimestampToDate(group.latestActionAt).getTime() + 30 * 60 * 1000;

	const now = new Date().getTime();

	if (now > groupExpiresAt) {
		return "EXPIRED";
	}

	const tenMinutesFromNow = now + 10 * 60 * 1000;

	if (tenMinutesFromNow > groupExpiresAt) {
		return "EXPIRING_SOON";
	}

	return null;
}

export function censorGroupsIfOwnExpired({
	groups,
	ownGroupExpiryStatus,
}: {
	groups: DividedGroups;
	ownGroupExpiryStatus: GroupExpiryStatus | null;
}): DividedGroups {
	if (ownGroupExpiryStatus !== "EXPIRED") return groups;

	return {
		own: groups.own,
		likesReceived: [],
		neutral: [],
	};
}

const allTiersOrdered = TIERS.flatMap((tier) => [
	{ name: tier.name, isPlus: true },
	{ name: tier.name, isPlus: false },
]).reverse();
export function tierDifferenceToRangeOrExact({
	ourTier,
	theirTier,
	hasLeviathan,
}: {
	ourTier: TieredSkill["tier"];
	theirTier: TieredSkill["tier"];
	hasLeviathan: boolean;
}): {
	diff: number;
	tier: TieredSkill["tier"] | [TieredSkill["tier"], TieredSkill["tier"]];
} {
	if (ourTier.name === theirTier.name && ourTier.isPlus === theirTier.isPlus) {
		return { diff: 0, tier: clone(ourTier) };
	}

	const tiers = hasLeviathan
		? allTiersOrdered
		: allTiersOrdered.filter((tier) => tier.name !== "LEVIATHAN");

	const tier1Idx = tiers.findIndex(
		(t) => t.name === ourTier.name && t.isPlus === ourTier.isPlus,
	);
	const tier2Idx = tiers.findIndex(
		(t) => t.name === theirTier.name && t.isPlus === theirTier.isPlus,
	);
	invariant(tier1Idx !== -1, "tier1 not found");
	invariant(tier2Idx !== -1, "tier2 not found");

	const idxDiff = Math.abs(tier1Idx - tier2Idx);

	const lowerBound = tier1Idx - idxDiff;
	const upperBound = tier1Idx + idxDiff;

	if (lowerBound < 0 || upperBound >= tiers.length) {
		return { diff: idxDiff, tier: clone(theirTier) };
	}

	const lowerTier = tiers[lowerBound];
	const upperTier = tiers[upperBound];

	return { diff: idxDiff, tier: [clone(lowerTier), clone(upperTier)] };
}

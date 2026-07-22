import { isWithinInterval, sub } from "date-fns";
import * as R from "remeda";
import type { DBBoolean, ParsedMemento, Tables } from "~/db/tables";
import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { defaultOrdinal } from "~/features/mmr/mmr-utils";
import { type TieredSkill, userSkills } from "~/features/mmr/tiered.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as SendouQMatch from "~/features/sendouq-match/core/SendouQMatch";
import type * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import type { SerializeFrom } from "~/utils/remix";
import { FULL_GROUP_SIZE } from "../q-constants";
import type { TierRange } from "../q-types";
import { getTierIndex } from "../q-utils.server";
import { tierDifferenceToRangeOrExact } from "./groups.server";

type DBGroupRow = Awaited<
	ReturnType<typeof SQGroupRepository.findCurrentGroups>
>[number];
type DBRecentlyFinishedMatchRow = Awaited<
	ReturnType<typeof SQGroupRepository.findRecentlyFinishedMatches>
>[number];
type DBMatch = NonNullable<
	Awaited<ReturnType<typeof SQMatchRepository.findById>>
>;

export type SQUncensoredGroup = SerializeFrom<
	(typeof SendouQClass.prototype.groups)[number]
>;
export type SQGroup = SerializeFrom<
	ReturnType<SendouQClass["lookingGroups"]>[number]
>;
export type SQOwnGroup = SerializeFrom<
	NonNullable<ReturnType<SendouQClass["findOwnGroup"]>>
>;
export type SQMatch = SerializeFrom<ReturnType<SendouQClass["mapMatch"]>>;
export type SQGroupMember = NonNullable<SQGroup["members"]>[number];

const FALLBACK_TIER = { isPlus: false, name: "IRON" } as const;
const SECONDS_TILL_STALE =
	process.env.NODE_ENV === "development" || IS_E2E_TEST_RUN ? 1_000_000 : 1_800;

class SendouQClass {
	groups;
	#recentMatches;
	#isAccurateTiers;
	#userSkills;
	#intervals;
	/** Array of user IDs currently in the queue */
	usersInQueue;

	constructor(
		groups: DBGroupRow[],
		recentMatches: DBRecentlyFinishedMatchRow[],
	) {
		const season = Seasons.currentOrPrevious();
		const {
			intervals,
			userSkills: calculatedUserSkills,
			isAccurateTiers,
		} = userSkills(season!.nth);

		this.#recentMatches = recentMatches;
		this.#isAccurateTiers = isAccurateTiers;
		this.#userSkills = calculatedUserSkills;
		this.#intervals = intervals;
		this.usersInQueue = groups.flatMap((group) =>
			group.members.map((member) => member.id),
		);
		this.groups = groups.map((group) => ({
			...group,
			noScreen: this.#groupNoScreen(group),
			modePreferences: this.#groupModePreferences(group),
			tier: this.#groupTier(group) as TieredSkill["tier"] | null,
			tierRange: null as TierRange | null,
			skillDifference:
				undefined as ParsedMemento["groups"][number]["skillDifference"],
			isReplay: false,
			usersRole: null as Tables["GroupMember"]["role"] | null,
			members: group.members.map((member) => {
				const skill = calculatedUserSkills[String(member.id)];

				return {
					...member,
					languages: member.languages?.split(",") || [],
					skill: !skill || skill.approximate ? ("CALCULATING" as const) : skill,
					mapModePreferences: undefined,
					noScreen: undefined,
					friendCode: null as string | null,
					inGameName: null as string | null,
					skillDifference:
						undefined as ParsedMemento["users"][number]["skillDifference"],
				};
			}),
		}));
	}

	/**
	 * Determines the current view state for a user based on their group status.
	 */
	currentViewByUserId(
		/** The ID of the logged in user */
		userId: number,
	) {
		const ownGroup = this.findOwnGroup(userId);

		if (!ownGroup) return "default";
		if (ownGroup.status === "PREPARING") return "preparing";
		if (ownGroup.matchId) return "match";

		return "looking";
	}

	/**
	 * Finds the group that a user belongs to.
	 * @returns The user's group with their role, or undefined if not in a group
	 */
	findOwnGroup(userId: number) {
		const result = this.groups.find((group) =>
			group.members.some((member) => member.id === userId),
		);
		if (!result) return;

		const member = result.members.find((m) => m.id === userId)!;

		return {
			...result,
			usersRole: member.role,
		};
	}

	/**
	 * Finds a group by its ID without censoring sensitive data.
	 * @returns The uncensored group, or undefined if not found
	 */
	findUncensoredGroupById(groupId: number) {
		return this.groups.find((group) => group.id === groupId);
	}

	/**
	 * Finds a group by its invite code.
	 * @returns The group with matching invite code, or undefined if not found
	 */
	findGroupByInviteCode(inviteCode: string) {
		return this.groups.find((group) => group.inviteCode === inviteCode);
	}

	/**
	 * Maps a database match to a format with appropriate censoring based on user permissions.
	 * Includes private notes for team members and censors sensitive data for non-participants.
	 * @returns The mapped match with censored data based on user permissions
	 */
	mapMatch(
		/** The database match object to map */
		match: DBMatch,
		/** The authenticated user viewing the match (if any) */
		user?: AuthenticatedUser,
	) {
		const viewerSide = SendouQMatch.resolveGroupMemberOf({
			groupAlpha: match.groupAlpha,
			groupBravo: match.groupBravo,
			userId: user?.id,
		});
		const isTeamAlphaMember = viewerSide === "ALPHA";
		const isTeamBravoMember = viewerSide === "BRAVO";
		const isMatchInsider = viewerSide !== null || user?.roles.includes("STAFF");
		const happenedInLastMonth = isWithinInterval(
			databaseTimestampToDate(match.createdAt),
			{
				start: sub(new Date(), { months: 1 }),
				end: new Date(),
			},
		);

		const matchGroupCensorer = (
			group: DBMatch["groupAlpha"] | DBMatch["groupBravo"],
			isTeamMember: boolean,
		) => {
			return {
				...group,
				chatCode: isTeamMember ? group.chatCode : undefined,
				tier: match.memento?.groups[group.id]?.tier,
				skillDifference: match.memento?.groups[group.id]?.skillDifference,
				matchmade: Boolean(group.matchmade),
				members: group.members.map((member) => {
					return {
						...member,
						skill: match.memento?.users[member.id]?.skill,
						skillDifference: match.memento?.users[member.id]?.skillDifference,
						noScreen: undefined,
						isContinuing:
							typeof member.isContinuing === "number"
								? Boolean(member.isContinuing)
								: null,
						friendCode:
							isMatchInsider && happenedInLastMonth
								? member.friendCode
								: undefined,
					};
				}),
			};
		};

		const alphaCensored = matchGroupCensorer(
			match.groupAlpha,
			isTeamAlphaMember,
		);
		const bravoCensored = matchGroupCensorer(
			match.groupBravo,
			isTeamBravoMember,
		);

		const reportedMapsCount = match.mapList.filter(
			(map) => map.winnerGroupId,
		).length;
		const currentMapRaw = match.mapList.at(reportedMapsCount);
		const currentMap = currentMapRaw
			? {
					...currentMapRaw,
					voters: this.#currentMapVoters({
						currentMap: currentMapRaw,
						groupAlpha: alphaCensored,
						groupBravo: bravoCensored,
						pools: match.memento?.pools,
					}),
				}
			: undefined;

		return {
			...match,
			chatCode: isMatchInsider ? match.chatCode : undefined,
			noScreen: Boolean(match.noScreen),
			currentMap,
			groupAlpha: alphaCensored,
			groupBravo: bravoCensored,
		};
	}

	/**
	 * Returns all groups with wide tier ranges for preview purposes. Full groups being preview always show the full range (IRON-LEVIATHAN)
	 * @returns Array of censored groups with preview tier ranges
	 */
	previewGroups(
		/** The ID of the user viewing the preview */
		userId: number,
	) {
		const usersTier = this.#getUserTier(userId);
		return this.groups
			.filter((group) => this.#isSuitableLookingGroup({ group }))
			.sort(this.#getSkillSortComparator(usersTier))
			.map((group) => this.#addPreviewTierRange(group))
			.map((group) => this.#censorGroup(group));
	}

	/**
	 * Returns groups that are available for matchmaking for a specific user based on their current group size.
	 * Filters groups based on member count compatibility, activity status, and excludes stale groups.
	 * Results are sorted by tier difference and activity.
	 * @returns Array of compatible groups sorted by relevance, or empty array if user has no group
	 */
	lookingGroups(
		/** The ID of the user looking for groups */
		userId: number,
	) {
		const ownGroup = this.findOwnGroup(userId);
		if (!ownGroup) return [];

		const currentMemberCountOptions =
			ownGroup.members.length === 4
				? [4]
				: ownGroup.members.length === 3
					? [1]
					: ownGroup.members.length === 2
						? [1, 2]
						: [1, 2, 3];

		return this.groups
			.filter((group) =>
				this.#isSuitableLookingGroup({
					group,
					ownGroupId: ownGroup.id,
					currentMemberCountOptions,
				}),
			)
			.map(this.#getGroupReplayMapper(userId))
			.map(this.#getAddTierRangeMapper(ownGroup.tier))
			.sort(this.#getSkillSortComparator(ownGroup.tier))
			.map((group) => this.#censorGroup(group));
	}

	#getGroupReplayMapper(userId: number) {
		const recentOpponents = this.#recentMatches.flatMap((match) => {
			if (match.groupAlphaMemberIds.includes(userId)) {
				return [match.groupBravoMemberIds];
			}

			if (match.groupBravoMemberIds.includes(userId)) {
				return [match.groupAlphaMemberIds];
			}

			return [];
		});

		return <T extends (typeof this.groups)[number]>(group: T) => {
			if (recentOpponents.length === 0) return group;
			if (!this.#groupIsFull(group)) return group;

			const isReplay = recentOpponents.some((opponentIds) => {
				const duplicateCount =
					R.countBy(opponentIds, (id) =>
						group.members.some((m) => m.id === id) ? "match" : "no-match",
					).match ?? 0;

				return duplicateCount >= 3;
			});

			return {
				...group,
				isReplay,
			};
		};
	}

	#getAddTierRangeMapper(ownTier?: TieredSkill["tier"] | null) {
		return <T extends (typeof this.groups)[number]>(group: T) => {
			if (!this.#groupIsFull(group)) {
				return group;
			}

			const tierRangeOrExact = tierDifferenceToRangeOrExact({
				ourTier: ownTier ?? FALLBACK_TIER,
				theirTier: group.tier ?? FALLBACK_TIER,
				hasLeviathan: this.#isAccurateTiers,
			});

			if (tierRangeOrExact.type === "exact") {
				return group;
			}

			return {
				...group,
				tierRange: R.omit(tierRangeOrExact, ["type"]),
				tier: null,
			};
		};
	}

	#addPreviewTierRange<T extends (typeof this.groups)[number]>(group: T) {
		if (!this.#groupIsFull(group)) {
			return group;
		}

		return {
			...group,
			tierRange: {
				type: "range" as const,
				range: [
					{ name: "IRON", isPlus: false } as TieredSkill["tier"],
					{ name: "LEVIATHAN", isPlus: true } as TieredSkill["tier"],
				],
				diff: 0,
			},
			tier: null,
		};
	}

	#censorGroup<T extends (typeof this.groups)[number]>(
		group: T,
	): Omit<T, "inviteCode" | "chatCode" | "members"> & {
		members: T["members"] | undefined;
	} {
		const {
			inviteCode: _inviteCode,
			chatCode: _chatCode,
			members,
			...baseGroup
		} = group;

		if (this.#groupIsFull(group)) {
			return {
				...baseGroup,
				members: undefined,
			};
		}

		return {
			...baseGroup,
			members,
		};
	}

	#getUserTier(userId: number): TieredSkill["tier"] | null {
		const skill = this.#userSkills[String(userId)];
		if (!skill || skill.approximate) {
			return null;
		}
		return skill.tier;
	}

	#getSkillSortComparator(ownTier?: TieredSkill["tier"] | null) {
		return <
			T extends {
				members: unknown[];
				tierRange: TierRange | null;
				tier: TieredSkill["tier"] | null;
				latestActionAt: number;
			},
		>(
			a: T,
			b: T,
		) => {
			const aIsFull = this.#groupIsFull(a);
			const bIsFull = this.#groupIsFull(b);

			if (aIsFull !== bIsFull) {
				return aIsFull ? 1 : -1;
			}

			if (a.tierRange && b.tierRange) {
				if (a.tierRange.diff[1] !== b.tierRange.diff[1]) {
					return a.tierRange.diff[1] - b.tierRange.diff[1];
				}
			}

			const ownTierIndex = getTierIndex(ownTier, this.#isAccurateTiers);
			if (typeof ownTierIndex === "number") {
				const diffA = Math.abs(
					ownTierIndex - (getTierIndex(a.tier, this.#isAccurateTiers) ?? 999),
				);
				const diffB = Math.abs(
					ownTierIndex - (getTierIndex(b.tier, this.#isAccurateTiers) ?? 999),
				);
				if (diffA !== diffB) {
					return diffA - diffB;
				}
			}

			return b.latestActionAt - a.latestActionAt;
		};
	}

	#groupNoScreen(group: { members: { noScreen: DBBoolean }[] }) {
		return this.#groupIsFull(group)
			? group.members.some((member) => member.noScreen)
			: null;
	}

	#groupModePreferences(
		group: DBGroupRow | DBMatch["groupAlpha"] | DBMatch["groupBravo"],
	): ModeShort[] {
		const modePreferences: ModeShort[] = [];

		for (const mode of modesShort) {
			let score = 0;
			for (const member of group.members) {
				const userModePreferences = member.mapModePreferences?.modes;
				if (!userModePreferences) continue;

				if (
					userModePreferences.some(
						(p) => p.mode === mode && p.preference === "PREFER",
					)
				) {
					score += 1;
				} else if (
					userModePreferences.some(
						(p) => p.mode === mode && p.preference === "AVOID",
					)
				) {
					score -= 1;
				}
			}

			if (score > 0) {
				modePreferences.push(mode);
			}
		}

		// reasonable default
		if (modePreferences.length === 0) {
			return ["SZ"];
		}

		return modePreferences;
	}

	#groupIsFull(group: { members: unknown[] }) {
		return group.members.length === FULL_GROUP_SIZE;
	}

	#currentMapVoters({
		currentMap,
		groupAlpha,
		groupBravo,
		pools,
	}: {
		currentMap: DBMatch["mapList"][number];
		groupAlpha: {
			id: number;
			members: Array<{
				id: number;
				username: string;
				discordId: string;
				discordAvatar: string | null;
			}>;
		};
		groupBravo: {
			id: number;
			members: Array<{
				id: number;
				username: string;
				discordId: string;
				discordAvatar: string | null;
			}>;
		};
		pools: ParsedMemento["pools"] | undefined;
	}) {
		if (!pools) return [];

		const pickerGroups = [groupAlpha, groupBravo].filter(
			(g) => currentMap.source === "BOTH" || String(g.id) === currentMap.source,
		);
		if (pickerGroups.length === 0) return [];

		return pickerGroups.flatMap((pickerGroup) =>
			pools.flatMap(({ userId, pool }) => {
				const member = pickerGroup.members.find((m) => m.id === userId);
				if (!member) return [];
				const modePool = pool.find((p) => p.mode === currentMap.mode);
				if (!modePool?.stages.includes(currentMap.stageId)) return [];
				return [
					{
						id: member.id,
						username: member.username,
						discordId: member.discordId,
						discordAvatar: member.discordAvatar,
					},
				];
			}),
		);
	}

	#groupTier(
		group: DBGroupRow | DBMatch["groupAlpha"] | DBMatch["groupBravo"],
	): TieredSkill["tier"] | undefined {
		if (!group.members) return;

		const skills = group.members.map(
			(m) => this.#userSkills[String(m.id)] ?? { ordinal: defaultOrdinal() },
		);

		const averageOrdinal =
			skills.reduce((acc, s) => acc + s.ordinal, 0) / skills.length;

		return (
			this.#intervals.find(
				(i) => i.neededOrdinal && averageOrdinal > i.neededOrdinal,
			) ?? { isPlus: false, name: "IRON" }
		);
	}

	#isSuitableLookingGroup({
		group,
		ownGroupId,
		currentMemberCountOptions,
	}: {
		group: SendouQClass["groups"][number];
		ownGroupId?: number;
		currentMemberCountOptions?: number[];
	}) {
		if (group.status !== "ACTIVE") return false;
		if (group.matchId) return false;
		if (group.id === ownGroupId) return false;
		if (
			currentMemberCountOptions &&
			!currentMemberCountOptions.includes(group.members.length)
		) {
			return false;
		}

		const staleThreshold = sub(new Date(), { seconds: SECONDS_TILL_STALE });
		const groupLastAction = databaseTimestampToDate(group.latestActionAt);
		return groupLastAction >= staleThreshold;
	}
}

const groups = await SQGroupRepository.findCurrentGroups();
const recentMatches = await SQGroupRepository.findRecentlyFinishedMatches();
/** Global instance of the SendouQ manager. Manages all active groups and matchmaking state. */
export let SendouQ = new SendouQClass(groups, recentMatches);

/**
 * Refreshes the global SendouQ instance with the latest data from the database.
 * Should be called after any database changes that affect groups or matches.
 */
export async function refreshSendouQInstance() {
	const groups = await SQGroupRepository.findCurrentGroups();
	const recentMatches = await SQGroupRepository.findRecentlyFinishedMatches();
	SendouQ = new SendouQClass(groups, recentMatches);
}

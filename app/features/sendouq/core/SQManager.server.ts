import * as R from "remeda";
import type { ParsedMemento } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import { defaultOrdinal } from "~/features/mmr/mmr-utils";
import {
	type SkillTierInterval,
	type TieredSkill,
	userSkills,
} from "~/features/mmr/tiered.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { FULL_GROUP_SIZE } from "../q-constants";
import type { TierDifference } from "../q-types";
import { tierDifferenceToRangeOrExact } from "./groups.server";

type DBGroupRow = Awaited<
	ReturnType<typeof QRepository.findCurrentGroups>
>[number];
type DBPrivateNoteRow = Awaited<
	ReturnType<typeof QRepository.allPrivateUserNotesByAuthorUserId>
>[number];
type DBRecentlyFinishedMatchRow = Awaited<
	ReturnType<typeof QRepository.findRecentlyFinishedMatches>
>[number];

export type SQGroup = SerializeFrom<
	ReturnType<SQManagerClass["lookingGroups"]>[number]
>;
export type SQOwnGroup = SerializeFrom<
	NonNullable<ReturnType<SQManagerClass["findOwnGroup"]>>
>;

const FALLBACK_TIER = { isPlus: false, name: "IRON" } as const;

class SQManagerClass {
	groups;
	recentMatches;
	isAccurateTiers;

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

		this.recentMatches = recentMatches;
		this.isAccurateTiers = isAccurateTiers;
		this.groups = groups.map((group) => ({
			...group,
			noScreen: this.#groupNoScreen(group),
			modePreferences: this.#groupModePreferences(group),
			tier: this.#groupTier({
				group,
				userSkills: calculatedUserSkills,
				intervals,
			}) as TieredSkill["tier"] | null,
			tierRange: null as TierDifference | null,
			skillDifference:
				undefined as ParsedMemento["groups"][number]["skillDifference"],
			isReplay: false,
			members: group.members.map((member) => {
				const skill = calculatedUserSkills[String(member.id)];

				return {
					...member,
					privateNote: null as DBPrivateNoteRow | null,
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

	currentViewByUserId(userId: number) {
		const ownGroup = this.findOwnGroup(userId);

		if (!ownGroup) return "default";
		if (ownGroup.status === "PREPARING") return "preparing";
		if (ownGroup.matchId) return "match";

		return "looking";
	}

	findOwnGroup(userId: number) {
		return this.groups.find((group) =>
			group.members.some((member) => member.id === userId),
		);
	}

	findGroupByInviteCode(inviteCode: string) {
		return this.groups.find((group) => group.inviteCode === inviteCode);
	}

	previewGroups(notes: DBPrivateNoteRow[]) {
		return this.groups
			.map((group) => this.#addPreviewTierRange(group))
			.map(this.#getAddMemberPrivateNoteMapper(notes))
			.map((group) => this.#censorGroup(group));
	}

	lookingGroups(userId: number, notes: DBPrivateNoteRow[]) {
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
			.filter(
				(group) =>
					group.status === "ACTIVE" &&
					!group.matchId &&
					group.id !== ownGroup.id &&
					currentMemberCountOptions.includes(group.members.length),
			)
			.map(this.#getGroupReplayMapper(userId))
			.map(this.#getAddTierRangeMapper(ownGroup.tier))
			.map(this.#getAddMemberPrivateNoteMapper(notes))
			.sort(this.#getNoteSortComparator())
			.map((group) => this.#censorGroup(group));
	}

	#getGroupReplayMapper(userId: number) {
		const recentOpponents = this.recentMatches.flatMap((match) => {
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

			const tierRange = tierDifferenceToRangeOrExact({
				ourTier: ownTier ?? FALLBACK_TIER,
				theirTier: group.tier ?? FALLBACK_TIER,
				hasLeviathan: this.isAccurateTiers,
			});

			return {
				...group,
				tierRange, // xxx: rename from range?
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
				range: [
					{ name: "IRON", isPlus: false } as TieredSkill["tier"],
					{ name: "LEVIATHAN", isPlus: true } as TieredSkill["tier"],
				],
				diff: 0,
			},
			tier: null,
		};
	}

	#censorGroup<T extends (typeof this.groups)[number]>(group: T) {
		const censored = R.omit(group, ["inviteCode", "chatCode"]);

		if (this.#groupIsFull(group)) {
			return {
				...censored,
				members: undefined,
			};
		}

		return censored;
	}

	#getAddMemberPrivateNoteMapper(notes: DBPrivateNoteRow[]) {
		return <T extends { members: { id: number }[] }>(group: T) => {
			const membersWithNotes = group.members.map((member) => {
				const note = notes.find((n) => n.targetUserId === member.id);
				return {
					...member,
					privateNote: note ?? null,
				};
			});

			return {
				...group,
				members: membersWithNotes,
			};
		};
	}

	#getNoteSortComparator() {
		return <T extends { members: { privateNote: DBPrivateNoteRow | null }[] }>(
			a: T,
			b: T,
		) => {
			const getGroupSentimentScore = (group: T) => {
				const hasNegative = group.members.some(
					(m) => m.privateNote?.sentiment === "NEGATIVE",
				);
				const hasPositive = group.members.some(
					(m) => m.privateNote?.sentiment === "POSITIVE",
				);

				if (hasNegative) return -1;
				if (hasPositive) return 1;
				return 0;
			};

			const scoreA = getGroupSentimentScore(a);
			const scoreB = getGroupSentimentScore(b);

			return scoreB - scoreA;
		};
	}

	#groupNoScreen(group: DBGroupRow) {
		return this.#groupIsFull(group)
			? group.members.some((member) => member.noScreen)
			: null;
	}

	#groupModePreferences(group: DBGroupRow): ModeShort[] {
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

	#groupTier({
		group,
		userSkills,
		intervals,
	}: {
		group: DBGroupRow;
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
}

const groups = await QRepository.findCurrentGroups();
const recentMatches = await QRepository.findRecentlyFinishedMatches();
export let SQManager = new SQManagerClass(groups, recentMatches);
// xxx: is manager the best name?

export async function refreshSQManagerInstance() {
	const groups = await QRepository.findCurrentGroups();
	const recentMatches = await QRepository.findRecentlyFinishedMatches();
	SQManager = new SQManagerClass(groups, recentMatches);
}

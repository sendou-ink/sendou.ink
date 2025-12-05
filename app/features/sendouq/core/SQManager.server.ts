import * as R from "remeda";
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
import invariant from "~/utils/invariant";
import type { SerializeFrom } from "~/utils/remix";
import { FULL_GROUP_SIZE } from "../q-constants";

type DBGroupRow = Awaited<
	ReturnType<typeof QRepository.findCurrentGroups>
>[number];
type DBPrivateNoteRow = Awaited<
	ReturnType<typeof QRepository.allPrivateUserNotesByAuthorUserId>
>[number];

export type SQGroup = SerializeFrom<
	ReturnType<SQManagerClass["lookingGroups"]>[number]
>;
export type SQOwnGroup = SerializeFrom<
	NonNullable<ReturnType<SQManagerClass["findOwnGroup"]>>
>;

class SQManagerClass {
	groups;

	constructor(groups: DBGroupRow[]) {
		const season = Seasons.currentOrPrevious();
		const { intervals, userSkills: calculatedUserSkills } = userSkills(
			season!.nth,
		);

		this.groups = groups.map((group) => ({
			...group,
			noScreen: this.#groupNoScreen(group),
			modePreferences: this.#groupModePreferences(group),
			tier: this.#groupTier({
				group,
				userSkills: calculatedUserSkills,
				intervals,
			}),
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

	previewGroups() {
		return [];
	}

	lookingGroups(userId: number, notes: DBPrivateNoteRow[]) {
		const ownGroup = this.findOwnGroup(userId);
		invariant(ownGroup, "ownGroup is undefined");

		const currentMemberCountOptions =
			ownGroup.members.length === 4
				? [4]
				: ownGroup.members.length === 3
					? [1]
					: ownGroup.members.length === 2
						? [1, 2]
						: [1, 2, 3];

		// xxx: tier range, if full
		return this.groups
			.filter(
				(group) =>
					group.id !== ownGroup.id &&
					currentMemberCountOptions.includes(group.members.length),
			)
			.map(this.#censorGroup)
			.map(this.getAddMemberPrivateNoteMapper(notes));
	}

	#censorGroup(group: (typeof this.groups)[number]) {
		if (this.#groupIsFull(group)) {
			R.omit(group, ["inviteCode", "chatCode", "members"]);
		}

		return R.omit(group, ["inviteCode", "chatCode"]);
	}

	getAddMemberPrivateNoteMapper(notes: DBPrivateNoteRow[]) {
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
// Initialization logic here
export const SQManager = new SQManagerClass(groups);
// xxx: is manager the best name?

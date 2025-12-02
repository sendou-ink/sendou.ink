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
import { FULL_GROUP_SIZE } from "../q-constants";

type DBGroupRow = Awaited<
	ReturnType<typeof QRepository.findCurrentGroups>
>[number];

class SQManager {
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
					skill: !skill || skill.approximate ? ("CALCULATING" as const) : skill,
					mapModePreferences: undefined,
					noScreen: undefined,
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

	lookingGroups(currentMemberCountOptions: number[]) {
		return this.groups
			.filter((group) =>
				currentMemberCountOptions.includes(group.members.length),
			)
			.map(this.#censorGroup);
	}

	#censorGroup(group: (typeof this.groups)[number]) {
		if (this.#groupIsFull(group)) {
			R.omit(group, ["inviteCode", "chatCode", "members"]);
		}

		return R.omit(group, ["inviteCode", "chatCode"]);
	}

	#groupNoScreen(group: DBGroupRow) {
		return this.#groupIsFull(group)
			? group.members.some((member) => member.noScreen)
			: null;
	}

	#groupModePreferences(group: DBGroupRow) {
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

export async function initSQManager() {
	const groups = await QRepository.findCurrentGroups();
	// Initialization logic here
	return new SQManager(groups);
}

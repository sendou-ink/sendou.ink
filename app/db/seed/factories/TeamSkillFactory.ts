import { rating } from "openskill";
import type { SkillTeamIdentifier } from "~/features/mmr/mmr-utils";
import * as MatchSkillRepository from "~/features/sendouq-match/MatchSkillRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = {
	identifier: SkillTeamIdentifier;
	season: number;
	mu: number;
	sigma: number;
	/** How many matches the roster has played, each one adding a skill row. */
	matchesCount: number;
};

/** Skill of a roster from matches outside of SendouQ (tournaments), so its players gain no SendouQ sets from it. A higher `mu` ranks higher. */
export const { create } = defineFactory({
	defaults: () => ({ season: 1, matchesCount: 1, ...rating() }),
	insert: async ({ matchesCount, ...skill }: InsertArgs) => {
		for (let i = 0; i < matchesCount; i++) {
			await MatchSkillRepository.insertMatchSkills([
				{ ...skill, userId: null, groupMatchId: null },
			]);
		}

		return { identifier: skill.identifier };
	},
});

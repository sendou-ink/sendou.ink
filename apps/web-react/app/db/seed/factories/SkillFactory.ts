import { rating } from "openskill";
import { db } from "~/db/sql";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { defineFactory } from "../core/defineFactory";

type Options = {
	/** How many matches the skill has behind it, deciding if it counts for rankings. */
	matchesCount: number;
};

/**
 * Creates a user's starting skill of a season. `mu` is the rating the ordinal every
 * ranking reads is derived from, so a user given a higher `mu` than another ranks
 * above them.
 */
export const { create, createMany } = defineFactory({
	defaults: () => ({ season: 1, ...rating() }),
	insert: SkillRepository.addInitialSkill,
	applyOptions: async (skill, { matchesCount }: Options) => {
		// written directly because production only raises `matchesCount` while reporting
		// a SendouQ match or finalizing a tournament, and a starting skill has neither
		await db
			.updateTable("Skill")
			.set({ matchesCount })
			.where("id", "=", skill.id)
			.execute();
	},
});

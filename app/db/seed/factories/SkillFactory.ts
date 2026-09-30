import { rating } from "openskill";
import { db } from "~/db/sql";
import * as SkillRepository from "~/features/mmr/SkillRepository.server";
import { defineFactory } from "../core/defineFactory";

type Options = {
	/** How many matches the skill has behind it, deciding if it counts for rankings. */
	matchesCount: number;
};

/** Starting skill of a season. Rankings read the ordinal derived from `mu`, so a higher `mu` ranks higher. */
export const { create, createMany } = defineFactory({
	defaults: () => ({ season: 1, ...rating() }),
	insert: SkillRepository.addInitialSkill,
	applyOptions: async (skill, { matchesCount }: Options) => {
		// written directly: production only raises `matchesCount` when reporting a match or finalizing a tournament
		await db
			.updateTable("Skill")
			.set({ matchesCount })
			.where("id", "=", skill.id)
			.execute();
	},
});

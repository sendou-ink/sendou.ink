import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { backdate } from "../core/backdate";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type Options = {
	/** When the post was last bumped, for one that should look stale. */
	updatedAt?: Date;
};

/** Creates LFG posts. `authorId` is who is looking; team-flavored types take a `teamId`. */
export const { create } = defineFactory({
	defaults: () => ({
		text: faker.lorem.paragraphs({ min: 1, max: 4 }),
		timezone: faker.helpers.arrayElement(TIMEZONES),
		type: faker.helpers.arrayElement([
			"PLAYER_FOR_TEAM" as const,
			"COACH_FOR_TEAM" as const,
		]),
		teamId: null,
		plusTierVisibility: null,
		languages: null,
	}),
	insert: LFGRepository.insertPost,
	applyOptions: async (post, { updatedAt }: Options) => {
		await backdate("LFGPost", post.id, { updatedAt });
	},
});

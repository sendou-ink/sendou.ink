import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type Options = {
	/** Who has won the badge; repeat an id for multiple wins. */
	ownerIds?: number[];
	/** Who can assign the badge to tournaments and winners. */
	managerIds?: number[];
};

export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		code: `badge-${seq}`,
		displayName: faker.lorem.words(2),
		hue: null,
		authorId: null,
	}),
	insert: BadgeRepository.insert,
	applyOptions: async (badge, { ownerIds, managerIds }: Options) => {
		if (ownerIds?.length) {
			await BadgeRepository.replaceOwners({ badgeId: badge.id, ownerIds });
		}

		if (managerIds?.length) {
			await BadgeRepository.replaceManagers({ badgeId: badge.id, managerIds });
		}
	},
});

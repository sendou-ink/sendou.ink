import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

export const { createMany } = defineFactory({
	defaults: ({ seq }) => ({
		code: `badge-${seq}`,
		displayName: faker.lorem.words(2),
		hue: null,
		authorId: null,
	}),
	insert: BadgeRepository.insert,
});

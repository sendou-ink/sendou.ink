import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker, unique } from "../core/faker";

/** Creates users. Columns outside `UserRepository.upsert` (profile fields, patron
 * status, plus tier) are set by the repository function that owns them. */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		discordId: String(seq),
		discordName: unique(() => faker.internet.username()),
		discordUniqueName: null,
		discordAvatar: null,
		twitch: null,
		youtubeId: null,
		bsky: null,
	}),
	insert: UserRepository.upsert,
});

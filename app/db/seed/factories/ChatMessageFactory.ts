import * as ChatRepository from "~/features/chat/ChatRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

/** Creates user-sent chat messages. System messages are inserted through the repository directly. */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		contents: faker.lorem.sentence(),
		publicId: `seed-msg-${seq}`,
	}),
	insert: (args: Parameters<typeof ChatRepository.insertMessage>[0]) =>
		ChatRepository.insertMessage(args),
});

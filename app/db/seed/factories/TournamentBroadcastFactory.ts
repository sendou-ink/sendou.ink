import { addDays } from "date-fns";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof BroadcastRepository.insertChatRoomIfMissing
>[0];

/** Gives a broadcast channel of the tournament its chat room, as setting the cast account does. */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		channel: { platform: "TWITCH" as const, account: `broadcast_${seq}` },
		expiresAt: addDays(new Date(), 7),
	}),
	insert: (args: InsertArgs) =>
		BroadcastRepository.insertChatRoomIfMissing(args),
});

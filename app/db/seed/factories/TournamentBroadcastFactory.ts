import { addDays } from "date-fns";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof BroadcastRepository.insertChatRoomIfMissing
>[0];

/** Gives a broadcast channel of the tournament its chat room, as setting the cast account does. */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		channel: { platform: "TWITCH" as const, account: `broadcast_${seq}` },
		rules: CAST_PRODUCER_RULES,
		expiresAt: addDays(new Date(), 7),
	}),
	insert: (args: InsertArgs) =>
		BroadcastRepository.insertChatRoomIfMissing(args),
});

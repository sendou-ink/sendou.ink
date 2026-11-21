import { addDays } from "date-fns";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import * as Producer from "~/features/broadcast/core/Producer";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import type {
	CastBroadcastSettings,
	CastProducerState,
} from "~/features/broadcast-cast/broadcast-cast-types";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof BroadcastRepository.insertChatRoomIfMissing
>[0];

type BroadcastKey = Omit<
	Parameters<typeof BroadcastRepository.updateProducer>[0],
	"rules" | "change"
>;

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

/**
 * Points the user's OBS URL at the channel's broadcast in the tournament like the dashboard's "Generate URL" and "Show this broadcast"
 * buttons, returning the URL's key.
 */
export async function pointProgram(key: BroadcastKey & { userId: number }) {
	const program = await BroadcastRepository.pointProgram({
		...key,
		rules: CAST_PRODUCER_RULES,
	});

	return program.programKey;
}

/** Edits the staged item like the dashboard's scene panel and puts it on air with a Take, no match cast on the channel. */
export function take({
	next,
	...key
}: BroadcastKey & { next: Producer.ItemPatch<CastProducerState> }) {
	return BroadcastRepository.updateProducer({
		...key,
		rules: CAST_PRODUCER_RULES,
		change: (state) =>
			Producer.take(
				CAST_PRODUCER_RULES,
				Producer.editItem(CAST_PRODUCER_RULES, state, state.next.id, next)!,
				{ liveResults: null, now: Date.now(), hasMatch: false },
			),
	});
}

/** Sets the broadcast's casters like the dashboard's casters form and volume sliders. */
export function setCasters({
	casters,
	...key
}: BroadcastKey & { casters: CastBroadcastSettings["casters"] }) {
	return BroadcastRepository.updateSettings<CastBroadcastSettings>({
		...key,
		rules: CAST_PRODUCER_RULES,
		patch: { casters },
	});
}

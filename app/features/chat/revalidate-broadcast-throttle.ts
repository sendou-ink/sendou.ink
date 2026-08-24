import type { RevalidateScope, SystemMessageType } from "./chat-types";
import { messageTypeToSound } from "./chat-utils";

interface ThrottleableMessage {
	channel: string;
	type?: SystemMessageType;
	revalidateOnly?: boolean;
	revalidateScope?: RevalidateScope;
}

interface ThrottleEntry {
	lastSentAt: number;
	trailing: {
		scope: RevalidateScope | undefined;
		timer: ReturnType<typeof setTimeout>;
	} | null;
}

/** Above this many channels tracked, idle ones are forgotten (see `prune`). */
export const MAX_ENTRIES = 5_000;

/**
 * Rate limits `revalidateOnly` broadcasts per channel so that a burst of them
 * (e.g. every player of a forming SendouQ match confirming within seconds, or every
 * reported game of a live tournament) fans out to the channel's subscribers at most
 * twice per window instead of once per event — each fan-out makes every subscribed
 * client refetch its loaders at once.
 *
 * The first broadcast of a window is delivered immediately; further broadcasts for
 * the same channel within the window coalesce into a single trailing broadcast at the
 * window's end, so subscribers never miss the final state. A trailing broadcast
 * covers every coalesced one: its scope is widened to the broadest seen and it
 * carries no author (nobody may skip it as their own) and no type.
 *
 * Broadcasts whose type plays a sound (a starting match, a ready check) are left alone:
 * coalescing would cost the player the sound, and they are rare enough not to be worth
 * rate limiting. Soundless types (a reported tournament game) are throttled like the
 * rest — they are the bulk of the traffic the throttle exists for.
 */
export function createRevalidateBroadcastThrottle({
	windowMs,
	sendLeading,
	sendTrailing,
}: {
	windowMs: number;
	/** Delivers a broadcast that opened a fresh window, unaltered. */
	sendLeading: (msg: ThrottleableMessage) => void;
	/** Delivers the coalesced trailing broadcast of a window. */
	sendTrailing: (msg: {
		channel: string;
		revalidateScope: RevalidateScope | undefined;
	}) => void;
}) {
	const entries = new Map<string, ThrottleEntry>();

	const prune = (now: number) => {
		if (entries.size <= MAX_ENTRIES) return;
		for (const [channel, entry] of entries) {
			if (!entry.trailing && now - entry.lastSentAt >= windowMs) {
				entries.delete(channel);
			}
		}
	};

	return {
		/**
		 * Whether the throttle applies to the message: a revalidation broadcast carrying
		 * no sound. Real chat messages always pass through untouched.
		 */
		throttles(
			msg: Pick<ThrottleableMessage, "type" | "revalidateOnly">,
		): boolean {
			return Boolean(msg.revalidateOnly) && !messageTypeToSound(msg.type);
		},
		handle(msg: ThrottleableMessage): void {
			const now = Date.now();
			prune(now);

			const entry = entries.get(msg.channel);
			if (!entry || (!entry.trailing && now - entry.lastSentAt >= windowMs)) {
				entries.set(msg.channel, { lastSentAt: now, trailing: null });
				sendLeading(msg);
				return;
			}

			if (entry.trailing) {
				// an unset scope means anything may have changed, so differing scopes widen to unset
				if (entry.trailing.scope !== msg.revalidateScope) {
					entry.trailing.scope = undefined;
				}
				return;
			}

			const timer = setTimeout(
				() => {
					const current = entries.get(msg.channel);
					if (!current?.trailing) return;
					current.lastSentAt = Date.now();
					const scope = current.trailing.scope;
					current.trailing = null;
					sendTrailing({ channel: msg.channel, revalidateScope: scope });
				},
				windowMs - (now - entry.lastSentAt),
			);
			timer.unref?.();
			entry.trailing = { scope: msg.revalidateScope, timer };
		},
	};
}

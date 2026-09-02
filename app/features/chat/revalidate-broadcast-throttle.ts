import type { RevalidateScope, SystemMessageType } from "./chat-types";
import { messageTypeToSound } from "./chat-utils";

interface ThrottleableMessage {
	channel: string;
	type?: SystemMessageType;
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
 * Rate limits revalidation broadcasts per channel so a burst (every player of a forming SendouQ
 * match confirming, every reported game of a live tournament) fans out at most twice per window:
 * the first is delivered immediately, the rest coalesce into one trailing broadcast at the
 * window's end whose scope is the broadest seen and which carries no author or type.
 *
 * Types that play a sound (starting match, ready check) are left alone: coalescing would cost
 * the sound, and they are rare. Soundless types are the bulk the throttle exists for.
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
		/** Whether the message is throttled; ones carrying a sound are not. */
		throttles(msg: Pick<ThrottleableMessage, "type">): boolean {
			return !messageTypeToSound(msg.type);
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

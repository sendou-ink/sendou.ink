import type * as Attention from "./Attention";

export function create({
	attention,
	playSound,
	resolveMentions,
}: {
	attention: Pick<
		Attention.Tracker,
		"isAttending" | "isLastActiveTab" | "subscribe"
	>;
	playSound: () => void;
	resolveMentions: (roomId: number) => void;
}) {
	const pendingRoomIds = new Set<number>();
	let unsubscribe: (() => void) | null = null;

	const resolvePending = () => {
		if (!attention.isAttending()) return;

		for (const roomId of pendingRoomIds) {
			resolveMentions(roomId);
		}
		pendingRoomIds.clear();
		unsubscribe?.();
		unsubscribe = null;
	};

	return {
		handleMention: ({
			roomId,
			roomViewed,
		}: {
			roomId: number;
			roomViewed: boolean;
		}) => {
			if (roomViewed) return;

			if (attention.isLastActiveTab()) playSound();

			if (attention.isAttending()) {
				resolveMentions(roomId);
				return;
			}

			pendingRoomIds.add(roomId);
			unsubscribe ??= attention.subscribe(resolvePending);
		},
	};
}

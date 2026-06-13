import { differenceInMinutes } from "date-fns";
import { useFetcher } from "react-router";
import { databaseTimestampToDate } from "~/utils/dates";

interface RoomLink {
	userId: number;
	url: string;
	refreshedAt: number;
}

interface ResolveActiveRoomLinkArgs {
	/** Room links for all match participants, sorted by `refreshedAt` ascending. */
	roomLinks: ReadonlyArray<RoomLink>;
	/** Database timestamp before which a link is considered stale (e.g. match start time). */
	freshnessCutoff: number;
	/** Viewer user id, used as fallback to surface the viewer's own stale link. */
	viewerUserId?: number;
	/** Members shown to resolve `hostedBy`. */
	members: ReadonlyArray<{ id: number; username: string }>;
}

interface ActiveRoomLink {
	joinLink?: string;
	hostedBy?: string;
	isStale?: boolean;
	staleMinutesAgo: number;
	refreshedAt?: Date;
}

/**
 * Selects the room link to display for a match. Prefers the oldest link refreshed
 * after the freshness cutoff (the host's confirmed room). Falls back to the
 * viewer's own stale link so they can refresh it themselves.
 */
export function resolveActiveRoomLink({
	roomLinks,
	freshnessCutoff,
	viewerUserId,
	members,
}: ResolveActiveRoomLinkArgs): ActiveRoomLink {
	const validRoomLink = roomLinks.find(
		(rl) => rl.refreshedAt >= freshnessCutoff,
	);
	const ownStaleRoomLink = validRoomLink
		? undefined
		: roomLinks.find((rl) => rl.userId === viewerUserId);

	const activeRoomLink = validRoomLink ?? ownStaleRoomLink;

	return {
		joinLink: activeRoomLink?.url,
		hostedBy: activeRoomLink
			? members.find((m) => m.id === activeRoomLink.userId)?.username
			: undefined,
		isStale: activeRoomLink ? !validRoomLink : undefined,
		staleMinutesAgo: ownStaleRoomLink
			? differenceInMinutes(
					new Date(),
					databaseTimestampToDate(ownStaleRoomLink.refreshedAt),
				)
			: 0,
		refreshedAt: validRoomLink
			? databaseTimestampToDate(validRoomLink.refreshedAt)
			: undefined,
	};
}

/** Confirms the viewer's room link by refreshing its timestamp via the central `/room` action. */
export function useConfirmRoom() {
	const fetcher = useFetcher();

	return {
		onConfirmRoom: () => {
			fetcher.submit(
				{ _action: "CONFIRM" },
				{ method: "post", action: "/room", encType: "application/json" },
			);
		},
		isConfirming: fetcher.state !== "idle",
	};
}

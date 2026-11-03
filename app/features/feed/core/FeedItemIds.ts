import { FEED_ITEM_TYPES, type FeedItemType } from "../feed-constants";

const ID_PATTERN = /^([A-Z0-9_]+)-(\d+)-([a-z0-9]+)$/;

/**
 * Id of a feed post: its type, when it happened and a hash of who it's about.
 * Comments and reactions are attached to it, so it stays the same for as long as the post shows the same thing.
 */
export function make({
	type,
	at,
	actorKey,
}: {
	type: FeedItemType;
	at: number;
	actorKey: string;
}) {
	return `${type}-${at}-${hash(actorKey)}`;
}

/** The post type of the id, `null` when it isn't a post id. */
export function typeOf(id: string): FeedItemType | null {
	const type = ID_PATTERN.exec(id)?.[1];
	if (!type || !Object.hasOwn(FEED_ITEM_TYPES, type)) return null;

	return type as FeedItemType;
}

function hash(value: string) {
	let result = 5381;
	for (let i = 0; i < value.length; i++) {
		result = ((result << 5) + result + value.charCodeAt(i)) >>> 0;
	}

	return result.toString(36);
}

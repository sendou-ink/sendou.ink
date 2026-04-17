export const MESSAGE_MAX_LENGTH = 200;

export const SPLATNET_ROOM_LINK_PATTERN = /https:\/\/s\.nintendo\.com\/\S+/g;

export function extractRoomLink(text: string): string | null {
	const match = text.match(SPLATNET_ROOM_LINK_PATTERN);
	return match?.[0] ?? null;
}

const MATCH_ROOM_URL_PATTERN =
	/^\/q\/match\/\d+$|^\/to\/\d+\/matches\/\d+$|^\/scrims\/\d+$/;

export function isMatchRoomUrl(url: string) {
	return MATCH_ROOM_URL_PATTERN.test(url);
}

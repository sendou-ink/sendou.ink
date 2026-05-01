export const MESSAGE_MAX_LENGTH = 200;

export const SPLATNET_ROOM_LINK_PATTERN = /https:\/\/s\.nintendo\.com\/\S+/g;

const SPLATNET_ROOM_URL_PATTERN = /^https:\/\/s\.nintendo\.com\/\S+$/;

export function extractRoomLink(text: string): string | null {
	const match = text.match(SPLATNET_ROOM_LINK_PATTERN);
	return match?.[0] ?? null;
}

export function isSplatnetRoomUrl(url: string) {
	return SPLATNET_ROOM_URL_PATTERN.test(url);
}

const MATCH_ROOM_URL_PATTERN =
	/^\/q\/match\/\d+$|^\/to\/\d+\/matches\/\d+$|^\/scrims\/\d+$/;

export function isMatchRoomUrl(url: string) {
	const pathname = URL.canParse(url) ? new URL(url).pathname : url;
	return MATCH_ROOM_URL_PATTERN.test(pathname);
}

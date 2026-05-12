export const MESSAGE_MAX_LENGTH = 200;

const SPLATNET_ROOM_HOST = "s.nintendo.com";
const SPLATNET_ROOM_PATH_PATTERN = /^\/[A-Za-z0-9/_-]+$/;
const SPLATNET_ROOM_CANDIDATE_PATTERN = /https:\/\/s\.nintendo\.com\/\S+/g;

export function isSplatnetRoomUrl(url: string): boolean {
	if (!URL.canParse(url)) return false;
	const parsed = new URL(url);
	return (
		parsed.protocol === "https:" &&
		parsed.hostname === SPLATNET_ROOM_HOST &&
		parsed.username === "" &&
		parsed.password === "" &&
		parsed.port === "" &&
		parsed.hash === "" &&
		SPLATNET_ROOM_PATH_PATTERN.test(parsed.pathname) &&
		isAllowedSplatnetSearch(parsed.searchParams)
	);
}

export function findRoomLinks(
	text: string,
): Array<{ url: string; index: number }> {
	const results: Array<{ url: string; index: number }> = [];
	for (const match of text.matchAll(SPLATNET_ROOM_CANDIDATE_PATTERN)) {
		if (isSplatnetRoomUrl(match[0])) {
			results.push({ url: match[0], index: match.index });
		}
	}
	return results;
}

export function extractRoomLink(text: string): string | null {
	return findRoomLinks(text)[0]?.url ?? null;
}

const MATCH_ROOM_URL_PATTERN =
	/^\/q\/match\/\d+$|^\/to\/\d+\/matches\/\d+$|^\/scrims\/\d+$/;

export function isMatchRoomUrl(url: string) {
	const pathname = URL.canParse(url) ? new URL(url).pathname : url;
	return MATCH_ROOM_URL_PATTERN.test(pathname);
}

function isAllowedSplatnetSearch(params: URLSearchParams): boolean {
	if (params.size === 0) return true;
	if (params.size > 1) return false;
	const p = params.get("p");
	return p !== null && SPLATNET_ROOM_PATH_PATTERN.test(p);
}

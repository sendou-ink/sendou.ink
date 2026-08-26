import type { Browser, Page } from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { CHAT_ROOMS_DATA_ROUTE, chatRoomMessagesRoute } from "~/utils/urls";
import { expect, impersonate } from "./playwright";

/**
 * A second logged in browser, for the tests needing two users connected at once:
 * live delivery cannot be seen by impersonating back and forth on one page, since
 * only one of the two ever holds an event stream.
 */
export async function openSecondUser(
	browser: Browser,
	baseURL: string,
	userId = ADMIN_ID,
) {
	const context = await browser.newContext({ baseURL });
	// the `context` fixture blocks these for the test's own context only
	await context.route(
		/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
		(route) => route.abort(),
	);

	const page = await context.newPage();
	await impersonate(page, userId);

	return { page, close: () => context.close() };
}

/** The rooms the API lists for whoever the page is logged in as. */
export async function fetchChatRooms(page: Page) {
	const response = await page.request.get(CHAT_ROOMS_DATA_ROUTE);
	expect(response.ok()).toBe(true);

	const { rooms } = (await response.json()) as {
		rooms: Array<{ id: number; type: string }>;
	};

	return rooms;
}

/** Status of reading a room's history directly, where a denial has no UI of its own. */
export async function chatHistoryStatus(page: Page, roomId: number) {
	const response = await page.request.get(chatRoomMessagesRoute(roomId));

	return response.status();
}

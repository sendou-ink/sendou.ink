import type { Page } from "@playwright/test";
import { voiceRoomDataRoute } from "~/utils/urls";
import { expect } from "./playwright";

/** Who the server has in the room's call, sorted, asked as whoever the page is logged in as. */
export async function voiceRoomUserIds(page: Page, roomId: number) {
	const response = await page.request.get(voiceRoomDataRoute(roomId));
	expect(response.ok()).toBe(true);

	const { userIds } = (await response.json()) as { userIds: number[] };

	return userIds.sort((a, b) => a - b);
}

import type { Locator } from "@playwright/test";
import { addDays, addHours } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { Factories } from "./factories";
import { expect } from "./playwright";

export const NO_EVENTS_TEXT = "No upcoming events";
export const NO_STREAMS_TEXT = "No streams currently";
export const NO_FRIENDS_TEXT = "Add friends to see their activity here";
export const LOGGED_OUT_FRIENDS_TEXT =
	"Log in to follow your friends' activity";

export function inHours(hours: number) {
	return dateToDatabaseTimestamp(addHours(new Date(), hours));
}

export function inDays(days: number) {
	return dateToDatabaseTimestamp(addDays(new Date(), days));
}

/** The Twitch account `LiveStreamFactory` gives a user's stream. */
export function streamAccountOf(userId: number) {
	return `stream_${userId}`;
}

/** Users the sidebar rows can be found by, one per name. */
export function createNamedUsers(
	factories: Factories,
	names: string[],
	overrides?: { twitch?: string },
) {
	return factories.UserFactory.createMany(names.length, (index) => ({
		...overrides,
		discordName: names[index],
	}));
}

export async function createUserIds(factories: Factories, count: number) {
	const users = await factories.UserFactory.createMany(count);

	return users.map((user) => user.id);
}

export function befriend(
	factories: Factories,
	friendIds: number[],
	userId = NZAP_TEST_ID,
) {
	return Promise.all(
		friendIds.map((friendId) =>
			factories.FriendshipFactory.create({
				userOneId: userId,
				userTwoId: friendId,
			}),
		),
	);
}

/** Asserts the rows are rendered in the order given, top to bottom. */
export async function expectTopToBottom(rows: Locator[]) {
	const tops: number[] = [];

	for (const row of rows) {
		await expect(row).toBeVisible();
		const box = await row.boundingBox();
		invariant(box, "Visible row has no bounding box");
		tops.push(box.y);
	}

	expect(tops).toEqual([...tops].sort((a, b) => a - b));
}

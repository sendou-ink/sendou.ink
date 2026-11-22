import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarFeedFactory from "~/db/seed/factories/CalendarFeedFactory";
import * as TeamEventFactory from "~/db/seed/factories/TeamEventFactory";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { databaseTimestampNow } from "~/utils/dates";
import { eventsFeedSearchParams } from "../calendar-search-params";
import { loader } from "./events[.]ics.server";

const HOUR = 60 * 60;

const users = UserFactory.pool();
const memberId = () => users.id(1);
const otherUserId = () => users.id(2);

const fetchFeed = (token: string) =>
	loader({
		request: new Request(
			new URL(
				eventsFeedSearchParams.href("/events.ics", { token }),
				"http://app.com",
			),
		),
	});

describe("events.ics loader", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("responds 404 to an unknown token", async () => {
		const response = await fetchFeed("unknown");

		expect(response.status).toBe(404);
	});

	test("responds 404 without a token", async () => {
		const response = await fetchFeed("");

		expect(response.status).toBe(404);
	});

	test("lists the token owner's events", async () => {
		const team = await TeamFactory.create({ memberUserIds: [memberId()] });
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "VoD review",
			startsAt: databaseTimestampNow() + HOUR,
			endsAt: databaseTimestampNow() + 2 * HOUR,
		});
		const { token } = await CalendarFeedFactory.create({ userId: memberId() });

		const response = await fetchFeed(token);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/calendar");
		expect(await response.text()).toContain("SUMMARY:VoD review");
	});

	test("doesn't list other users' events", async () => {
		const team = await TeamFactory.create({ memberUserIds: [memberId()] });
		await TeamEventFactory.create({
			teamId: team.id,
			authorId: memberId(),
			name: "VoD review",
			startsAt: databaseTimestampNow() + HOUR,
			endsAt: databaseTimestampNow() + 2 * HOUR,
		});
		const { token } = await CalendarFeedFactory.create({
			userId: otherUserId(),
		});

		const response = await fetchFeed(token);

		expect(response.status).toBe(200);
		expect(await response.text()).not.toContain("BEGIN:VEVENT");
	});
});

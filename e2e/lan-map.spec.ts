import { addDays } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { LAN_MAP_PAGE } from "~/utils/urls";
import { expect, navigate, test } from "./helpers/playwright";
import { CalendarPage } from "./pages/calendar/calendar-page";

/** Draws nothing but loads instantly, the real OpenFreeMap style would fetch its tiles from the internet. */
const BLANK_MAP_STYLE = { version: 8, sources: {}, layers: [] };

test.describe("LAN map", () => {
	test("shows upcoming LANs and opens their cards", async ({
		page,
		factories,
	}) => {
		await page.route("https://tiles.openfreemap.org/**", (route) =>
			route.fulfill({ json: BLANK_MAP_STYLE }),
		);

		const startTimes = [dateToDatabaseTimestamp(addDays(new Date(), 3))];
		const helsinki = await factories.CalendarEventFactory.create({
			authorId: ADMIN_ID,
			name: "Helsinki LAN",
			startTimes,
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: helsinki.id,
			name: "Messukeskus",
			address: "Messuaukio 1, 00520 Helsinki, Finland",
			city: "Helsinki",
			countryCode: "FI",
			latitude: 60.2033,
			longitude: 24.9364,
			timezone: "Europe/Helsinki",
		});
		const austin = await factories.CalendarEventFactory.create({
			authorId: ADMIN_ID,
			name: "Austin LAN",
			startTimes,
		});
		await factories.CalendarEventVenueFactory.create({
			eventId: austin.id,
			name: "Austin Convention Center",
			address: "500 East Cesar Chavez Street, 78701 Austin, TX, United States",
			city: "Austin",
			countryCode: "US",
			latitude: 30.2636,
			longitude: -97.7397,
			timezone: "America/Chicago",
		});
		await factories.CalendarEventFactory.create({
			authorId: ADMIN_ID,
			name: "Online event",
			startTimes,
		});

		await new CalendarPage(page).goto();
		await page.getByTestId("lan-map-button").click();
		await expect(page).toHaveURL(LAN_MAP_PAGE);

		await expect(
			page.getByRole("button", { name: "Helsinki LAN" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Austin LAN" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Online event" }),
		).toHaveCount(0);

		await page.getByRole("button", { name: "Austin LAN" }).click();
		const card = page.getByTestId("lan-card");
		await expect(card).toContainText("Austin LAN");
		await expect(card).toContainText("Austin");

		await page.getByRole("button", { name: "Helsinki LAN" }).click();
		await expect(card).toContainText("Helsinki LAN");

		await card.getByRole("link", { name: "Helsinki LAN" }).click();
		await expect(page).toHaveURL(`/calendar/${helsinki.id}`);
	});

	test("says there are no LANs instead of showing an empty map", async ({
		page,
	}) => {
		await navigate({ page, url: LAN_MAP_PAGE });

		await expect(page.getByText("No upcoming LANs")).toBeVisible();
		await expect(page.getByTestId("lan-map")).toHaveCount(0);
	});
});

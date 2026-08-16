import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { EVENTS_PAGE } from "~/utils/urls";
import {
	expect,
	expectNoErrorPage,
	impersonate,
	test,
} from "./helpers/playwright";
import { expectTopToBottom, inHours, NO_EVENTS_TEXT } from "./helpers/sidebar";
import { EventsPage } from "./pages/calendar/events-page";
import { FrontPage } from "./pages/front-page/front-page";
import { SideNav } from "./pages/layout/side-nav";

test.describe("Sidebar events", () => {
	test("shows my tournaments, my scrims and saved events, soonest first", async ({
		page,
		factories,
	}) => {
		const saved = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: "Saved Tournament",
			startTimes: [inHours(1)],
		});
		await factories.SavedCalendarEventFactory.create({
			userId: NZAP_TEST_ID,
			tournamentId: saved.id,
		});

		const played = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: "Played Tournament",
			startTimes: [inHours(2)],
		});
		await factories.TournamentTeamFactory.create({
			tournamentId: played.id,
			memberUserIds: [NZAP_TEST_ID],
		});

		await factories.ScrimPostFactory.create({
			startsAt: inHours(3),
			users: [{ userId: NZAP_TEST_ID, isOwner: 1 }],
		});

		await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			name: "Organized Tournament",
			startTimes: [inHours(4)],
		});

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.locators.listItems).toHaveCount(4);
		await expectTopToBottom([
			sideNav.eventItem("Saved Tournament"),
			sideNav.eventItem("Played Tournament"),
			sideNav.eventItem("Looking for scrim"),
			sideNav.eventItem("Organized Tournament"),
		]);
		await expect(sideNav.itemSubtitle("Played Tournament")).toHaveText(
			/\d{1,2}:\d{2}/,
		);

		await sideNav.eventItem("Played Tournament").click();

		await expect(page).toHaveURL(new RegExp(`/to/${played.id}`));
		await expectNoErrorPage(page);
	});

	test("scrim rows show their status and link to the right place", async ({
		page,
		factories,
	}) => {
		const [opponentOwner, otherPostOwner] =
			await factories.UserFactory.createMany(2);
		const opponentTeam = await factories.TeamFactory.create({
			name: "Squid Squad",
			memberUserIds: [opponentOwner.id],
		});

		const booked = await factories.ScrimPostFactory.create(
			{
				startsAt: inHours(1),
				teamId: opponentTeam.id,
				users: [{ userId: opponentOwner.id, isOwner: 1 }],
			},
			{
				requests: [
					{ users: [{ userId: NZAP_TEST_ID, isOwner: 1 }], isAccepted: true },
				],
			},
		);
		await factories.ScrimPostFactory.create({
			startsAt: inHours(2),
			users: [{ userId: NZAP_TEST_ID, isOwner: 1 }],
		});
		const pending = await factories.ScrimPostFactory.create(
			{
				startsAt: inHours(3),
				users: [{ userId: otherPostOwner.id, isOwner: 1 }],
			},
			{ requests: [{ users: [{ userId: NZAP_TEST_ID, isOwner: 1 }] }] },
		);

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.eventItem("vs. Squid Squad")).toBeVisible();
		await expect(sideNav.eventItem("Looking for scrim")).toBeVisible();
		await expect(sideNav.eventItem("Request pending")).toBeVisible();

		await sideNav.eventItem("vs. Squid Squad").click();
		await expect(page).toHaveURL(`/scrims/${booked.id}`);
		await expectNoErrorPage(page);

		await front.goto();
		await sideNav.eventItem("Looking for scrim").click();
		await expect(page).toHaveURL("/scrims");

		await front.goto();
		await expect(sideNav.eventItem("Request pending")).toHaveAttribute(
			"href",
			`/scrims?pendingRequestPostId=${pending.id}`,
		);

		await sideNav.eventItem("Request pending").click();
		// the scrims page clears the param once it has scrolled to the post
		await expect(page).toHaveURL("/scrims");
		await expectNoErrorPage(page);
	});

	test("caps at five events and View all opens the events page", async ({
		page,
		factories,
	}) => {
		for (const nth of [1, 2, 3, 4, 5, 6, 7]) {
			const tournament = await factories.TournamentFactory.create({
				authorId: ADMIN_ID,
				name: `Tournament ${nth}`,
				startTimes: [inHours(nth)],
			});
			await factories.TournamentTeamFactory.create({
				tournamentId: tournament.id,
				memberUserIds: [NZAP_TEST_ID],
			});
		}

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.locators.listItems).toHaveCount(5);
		await expect(sideNav.eventItem("Tournament 5")).toBeVisible();
		await expect(sideNav.eventItem("Tournament 6")).toHaveCount(0);

		await sideNav.viewAllLink("Events").click();
		await expect(page).toHaveURL(EVENTS_PAGE);

		const events = new EventsPage(page);
		await expect(events.eventLink("Tournament 6")).toBeVisible();
		await expect(events.eventLink("Tournament 7")).toBeVisible();
	});

	test("shows an empty state without upcoming events", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.emptyText(NO_EVENTS_TEXT)).toBeVisible();
		await expect(sideNav.viewAllLink("Events")).toBeVisible();
	});
});

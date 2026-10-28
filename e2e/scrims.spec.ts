import {
	addDays,
	addHours,
	addWeeks,
	setHours,
	setMinutes,
	startOfHour,
} from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import * as Availability from "~/features/availability/core/Availability";
import { serializeLutiDiv } from "~/features/scrims/scrims-utils";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { toDBBoolean } from "~/utils/sql";
import { scrimPage } from "~/utils/urls";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	MACHINE_TIMEZONE,
	navigate,
	setTimezoneCookie,
	test,
} from "./helpers/playwright";
import { AnythingAdder } from "./pages/layout/anything-adder";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { NewScrimPostPage } from "./pages/scrims/new-scrim-post-page";
import { ScrimPage } from "./pages/scrims/scrim-page";
import { ScrimsPage } from "./pages/scrims/scrims-page";

const TEST_POOL_SERIALIZED = "sz:3a14000;tc:2c98000";
const TOURNAMENT_NAME = "Swim or Sink";
const ASSOCIATION_NAME = "Inkling Alliance";
const PICKUP_NAMES = ["Pickup One", "Pickup Two", "Pickup Three"];
const REQUEST_MESSAGE = "Ready to scrim! Let's do this.";
const GROUP_SIZE = 4;
const DAY_SECONDS = 24 * 60 * 60;
const WEDNESDAY = 2;
const TOURNAMENT_MAP_POOL: Array<{ mode: ModeShort; stageId: StageId }> = [
	{ mode: "SZ", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "RM", stageId: 3 },
	{ mode: "CB", stageId: 4 },
];

test.describe("Scrims", () => {
	/**
	 * A post is made as a team or as a pick-up of users the author picks, who are saved
	 * for later posts. Its card shows the start window and the tournament whose maps are
	 * played, and marks a post only an association can see.
	 */
	test.describe("Posting", () => {
		test("a post limited to an association is marked as such and its owner can delete it", async ({
			page,
			factories,
		}) => {
			await createNamedUsers(factories, PICKUP_NAMES);
			await factories.AssociationFactory.create({
				userId: NZAP_TEST_ID,
				name: ASSOCIATION_NAME,
			});

			await impersonate(page, NZAP_TEST_ID);
			await navigate({ page, url: "/" });

			await new AnythingAdder(page).add("scrimPost");

			const newPost = new NewScrimPostPage(page);
			await newPost.selectPickupUsers(PICKUP_NAMES);
			await newPost.selectVisibility(ASSOCIATION_NAME);
			await newPost.form.fill("postText", "Test scrim");
			await newPost.save();

			const scrims = new ScrimsPage(page);
			await expect(scrims.locators.limitedVisibilityPopover).toBeVisible();

			await scrims.deleteFirstPost();

			await expect(scrims.locators.deleteButtons).toHaveCount(0);
		});

		test("reuses a pick-up saved from an earlier scrim post", async ({
			page,
			factories,
		}) => {
			await createNamedUsers(factories, PICKUP_NAMES);

			await impersonate(page, NZAP_TEST_ID);

			const newPost = new NewScrimPostPage(page);
			await newPost.goto();
			await newPost.selectPickupUsers(PICKUP_NAMES);
			await newPost.save();

			await newPost.goto();
			await newPost.selectSavedPickup(PICKUP_NAMES);

			for (const [index, userName] of PICKUP_NAMES.entries()) {
				await expect(newPost.pickupUser(index + 2)).toContainText(userName);
			}

			await newPost.save();

			const scrims = new ScrimsPage(page);
			await expect(scrims.locators.deleteButtons).toHaveCount(2);
		});

		test("a post's start window and tournament maps show on its card", async ({
			page,
			factories,
		}) => {
			await createTeamFor(factories, ADMIN_ID);
			await createTournament(factories);

			await impersonate(page, ADMIN_ID);

			const newPost = new NewScrimPostPage(page);
			await newPost.goto();
			await newPost.form.setDateTime("at", tomorrowEvening());
			await newPost.form.select("rangeEnd", "+2hours");
			await newPost.selectTournamentMaps(TOURNAMENT_NAME);
			await newPost.save();

			const scrims = new ScrimsPage(page);
			await expect(scrims.post("+2h")).toBeVisible();
			await expect(scrims.locators.tournamentPopover).toBeVisible();
		});
	});

	/**
	 * Other teams request a post from the Available tab, picking the start when the post has
	 * a start window, and can withdraw the request while it is pending. The post's owner is
	 * notified of each request.
	 */
	test.describe("Requests", () => {
		test("requests a post and withdraws the request", async ({
			page,
			factories,
		}) => {
			for (let postNth = 0; postNth < 2; postNth++) {
				await factories.ScrimPostFactory.create({
					users: await createGroup(factories),
				});
			}
			await createTeamFor(factories, NZAP_TEST_ID);

			await impersonate(page, NZAP_TEST_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();
			await scrims.openTab("available");

			await expect(scrims.locators.requestButtons).toHaveCount(2);

			const request = await scrims.requestFirst();
			await request.send();

			await expect(scrims.locators.requestButtons).toHaveCount(1);

			await scrims.showPendingRequests();
			await scrims.cancelPendingRequest();

			await expect(scrims.locators.requestButtons).toHaveCount(2);
		});

		test("a request to a post with a start window picks the start and can carry a message", async ({
			page,
			factories,
		}) => {
			const at = tomorrowEvening();
			await factories.ScrimPostFactory.create({
				users: await createGroup(factories, ADMIN_ID),
				startsAt: dateToDatabaseTimestamp(at),
				rangeEndsAt: dateToDatabaseTimestamp(addHours(at, 2)),
				isScheduledForFuture: true,
			});
			await createNamedUsers(factories, PICKUP_NAMES);

			await test.step("N-ZAP requests it with a pick-up, a start and a message", async () => {
				await impersonate(page, NZAP_TEST_ID);

				const scrims = new ScrimsPage(page);
				await scrims.goto();
				await scrims.openTab("available");

				const request = await scrims.requestFirst();
				await request.selectPickupUsers(PICKUP_NAMES);
				await request.selectStartTime(1);
				await request.form.fill("message", REQUEST_MESSAGE);
				await request.send();
			});

			await test.step("Sendou is notified and sees the message", async () => {
				await impersonate(page, ADMIN_ID);

				const scrims = new ScrimsPage(page);
				await scrims.goto();

				const notifications = new NotificationPopover(page);
				await notifications.open();

				await expect(
					notifications.notification("N-ZAP requested a scrim"),
				).toBeVisible();

				await notifications.close();

				await expect(scrims.post(REQUEST_MESSAGE)).toBeVisible();
			});
		});
	});

	/**
	 * Accepting a request books the scrim: it moves to the Booked tab with a page of its own,
	 * the requester is notified and the owner's other pending posts starting within an hour
	 * of it are deleted.
	 */
	test.describe("Accepting", () => {
		test("accepting resolves the request notification and notifies the requester", async ({
			page,
			factories,
		}) => {
			const post = await createPostWithRequest(factories, {
				ownerUserId: ADMIN_ID,
				requesterUserId: NZAP_TEST_ID,
			});
			await factories.NotificationFactory.create({
				notification: {
					type: "SCRIM_NEW_REQUEST",
					meta: {
						fromUserId: NZAP_TEST_ID,
						fromUsername: "N-ZAP",
						scrimPostId: post.id,
					},
				},
				users: [{ userId: ADMIN_ID }],
			});

			await impersonate(page, ADMIN_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();

			const notifications = new NotificationPopover(page);
			await expect(notifications.locators.bellDot).toBeVisible();

			await scrims.acceptFirstRequest();

			// accepting settled the post, resolving the request notification without
			// the bell having been opened
			await expect(notifications.locators.bellDot).toBeHidden();

			await scrims.openTab("booked");
			await expect(scrims.locators.contactLinks).toHaveCount(1);

			const scrim = await scrims.openFirstBookedScrim();

			await expect(scrim.locators.subtitle).toBeVisible();

			// the requester got notified of the scheduled scrim, linking to its page
			await impersonate(page, NZAP_TEST_ID);
			await navigate({ page, url: "/" });

			await notifications.open();
			await notifications.openNotification("New scrim scheduled vs.");

			await expect(page).toHaveURL(scrimPage(post.id));
		});

		test("auto-cancels overlapping pending scrims when a scrim is booked", async ({
			page,
			factories,
		}) => {
			await createTeamFor(factories, ADMIN_ID);
			await createTeamFor(factories, NZAP_TEST_ID);

			const bookedAt = tomorrowEvening();
			// within ±1h of the booked time
			const overlappingAt = setMinutes(bookedAt, 30);
			// outside the ±1h window
			const farAwayAt = setHours(bookedAt, 22);

			await impersonate(page, ADMIN_ID);

			const newPost = new NewScrimPostPage(page);
			for (const [at, text] of [
				[bookedAt, "Booked post"],
				[overlappingAt, "Overlapping post"],
				[farAwayAt, "Far away post"],
			] as const) {
				await newPost.goto();
				await newPost.form.setDateTime("at", at);
				await newPost.form.fill("postText", text);
				await newPost.save();
			}

			// N-ZAP requests the earliest (soon-to-be-booked) post
			await impersonate(page, NZAP_TEST_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();
			await scrims.openTab("available");

			const request = await scrims.requestFirst();
			await request.send();

			// the author accepts the request, booking the scrim
			await impersonate(page, ADMIN_ID);
			await scrims.goto();
			await scrims.acceptFirstRequest();

			await scrims.openTab("owned");

			await expect(scrims.post("Far away post")).toBeVisible();
			await isNotVisible(scrims.post("Overlapping post"));
		});
	});

	/** A booked scrim is canceled from its page with a reason, and is then shown as canceled. */
	test.describe("Canceling", () => {
		test("cancels a scrim and shows canceled status", async ({
			page,
			factories,
		}) => {
			await createPostWithRequest(factories, {
				ownerUserId: ADMIN_ID,
				at: addHours(new Date(), 4),
			});

			await impersonate(page, ADMIN_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();

			// accepting is what makes the scrim's own page accessible
			await scrims.acceptFirstRequest();
			await scrims.openTab("booked");

			const scrim = await scrims.openFirstBookedScrim();
			await scrim.cancel("Oops something came up");

			await scrims.goto();

			await expect(scrims.locators.canceledLabel).toBeVisible();
		});
	});

	/**
	 * Filters (here LUTI divisions) narrow the Available tab and can be saved as the user's
	 * default. Once the user edits the filters the page's own wins over the saved default.
	 */
	test.describe("Filters", () => {
		test("filters by div and sets the filter as default", async ({
			page,
			factories,
		}) => {
			await factories.ScrimPostFactory.create({
				users: await createGroup(factories),
				maxDiv: serializeLutiDiv("1"),
				minDiv: serializeLutiDiv("2"),
			});

			await impersonate(page, NZAP_TEST_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();
			await scrims.openTab("available");

			await expect(scrims.locators.requestButtons).toHaveCount(1);

			// a div range the post's own range falls outside of
			await scrims.filterByDivs({ max: "5", min: "6" });

			await expect(scrims.locators.requestButtons).toHaveCount(0);

			await scrims.saveFiltersAsDefault();
			await scrims.goto();
			await scrims.openTab("available");

			// remembers selection via user preferences
			await expect(scrims.locators.requestButtons).toHaveCount(0);

			await scrims.removeDivsFilter();

			// removing the filter sticks instead of falling back to the saved default
			await expect(scrims.locators.requestButtons).toHaveCount(1);

			await scrims.reload();

			await expect(scrims.locators.requestButtons).toHaveCount(1);
		});
	});

	/**
	 * Once booked, each side submits a map list (the post's tournament or a map pool) and
	 * maps are generated one at a time from the lists, each reported map generating the
	 * next. The latest report can be undone and the current map swapped for a replay of the
	 * previous one. Stats count the reported maps from the viewer's side.
	 */
	test.describe("Map-by-map", () => {
		test("plays a scrim map by map", async ({ page, factories }) => {
			const tournament = await createTournament(factories);
			const post = await createPostWithRequest(factories, {
				ownerUserId: ADMIN_ID,
				requesterUserId: NZAP_TEST_ID,
				mapsTournamentId: tournament.id,
				isAccepted: true,
			});
			const scrim = new ScrimPage(page);

			await test.step("Sendou submits the post's tournament as Alpha's list, generating the first map", async () => {
				await impersonate(page, ADMIN_ID);
				await scrim.goto(post.id);
				await scrim.openTab("action");

				await expect(scrim.locators.mapListForm).toBeVisible();

				// the post's tournament is the author's default source, so no tournament search is
				// needed; the first map list submitted collapses the map-list manager
				await scrim.submitMapList();

				await expect(scrim.locators.reportScoreButton).toBeVisible();

				await scrim.openMapListManager();

				await expect(scrim.mapListRow("ALPHA")).toContainText(TOURNAMENT_NAME);
			});

			await test.step("N-ZAP adds a map pool as Bravo's list", async () => {
				// N-ZAP has no list yet, so the map-list manager is already expanded on mount
				await impersonate(page, NZAP_TEST_ID);
				await scrim.goto(post.id);
				await scrim.openTab("action");
				await scrim.submitPoolMapList(TEST_POOL_SERIALIZED);

				await expect(scrim.locators.reportScoreButton).toBeVisible();
				await expect(scrim.mapListRow("BRAVO")).toContainText("Pool");
			});

			await test.step("Each reported winner generates the next map", async () => {
				await scrim.reportMapWinner("ALPHA");
				await expect(scrim.locators.reportScoreButton).toBeVisible();

				await scrim.reportMapWinner("BRAVO");
				await expect(scrim.locators.reportScoreButton).toBeVisible();
			});

			await test.step("Undo un-reports the latest map and removes the one it generated", async () => {
				await scrim.reportMapWinner("ALPHA");
				await expect(scrim.locators.undoMapButton).toBeVisible();
				await scrim.undoMap();
				await expect(scrim.locators.reportScoreButton).toBeVisible();
			});

			await test.step("Replay swaps the current map for the previous one", async () => {
				await scrim.reportMapWinner("BRAVO");

				await expect(scrim.locators.replayMapButton).toBeVisible();
				await scrim.replayMap();
				await scrim.reportMapWinner("ALPHA");
			});

			await test.step("Sendou swaps Alpha's list for a map pool", async () => {
				await impersonate(page, ADMIN_ID);
				await scrim.goto(post.id);
				await scrim.openTab("action");
				await scrim.openMapListManager();

				await scrim.removeOwnMapList("ALPHA");

				await expect(scrim.locators.mapListForm).toBeVisible();

				await scrim.submitPoolMapList(TEST_POOL_SERIALIZED);

				await expect(scrim.mapListRow("ALPHA")).toContainText("Pool");
			});

			await test.step("Stats count the four reported maps", async () => {
				await scrim.openTab("stats");

				await expect(scrim.locators.statsRoot).toBeVisible();

				// 2 wins & 2 losses from Sendou's point of view
				await scrim.showModeStatsOfAllMaps();

				expect(await scrim.reportedMapCount()).toBe(4);
			});
		});
	});

	/**
	 * The members' weekly availability suggests starts when posting and shows how much of
	 * the viewer's roster could play each post. A slot one player short of a full team is
	 * still offered, as one to grab a sub for.
	 */
	test.describe("Availability", () => {
		test("picks a start and its flexibility from the roster's shared free time", async ({
			page,
			factories,
		}) => {
			const { memberUserIds } = await createTeamFor(factories, NZAP_TEST_ID);
			const evening = nextWeekSlot(WEDNESDAY, "18:00", "23:00");

			for (const userId of memberUserIds.slice(0, memberUserIds.length - 1)) {
				await factories.AvailabilityWeekFactory.create({
					userId,
					weekStartsAt: nextWeek().startsAt,
					timezone: MACHINE_TIMEZONE,
					slots: [evening],
				});
			}

			await impersonate(page, NZAP_TEST_ID);
			await setTimezoneCookie(page);

			const newPost = new NewScrimPostPage(page);
			await newPost.goto();
			await newPost.locators.nextWeekToggle.click();

			// the roster's last member never filled the week in, so the shared
			// evening is one player short of a full team
			await expect(newPost.locators.scheduleUnknown).toBeVisible();
			const slot = newPost.locators.scheduleSlots;
			await expect(slot).toHaveCount(1);
			await expect(slot).toHaveAttribute("data-tier", "ONE_SHORT");

			await slot.click();

			// 18:00, with the flexibility that still leaves an hour of the window
			// to play whichever start is settled on, capped at the longest option
			await expect(newPost.startInput).toHaveValue(/T18:00$/);
			await expect(newPost.locators.flexibility).toHaveValue("+3hours");
			await expect(slot).toHaveAttribute("data-picked", "true");
		});

		test("shows how much of the viewer's roster could play a post", async ({
			page,
			factories,
		}) => {
			const { memberUserIds } = await createTeamFor(factories, NZAP_TEST_ID);
			const evening = nextWeekSlot(WEDNESDAY, "18:00", "23:00");
			const withoutSchedule = memberUserIds[memberUserIds.length - 1];

			for (const userId of memberUserIds.filter(
				(candidate) => candidate !== withoutSchedule,
			)) {
				await factories.AvailabilityWeekFactory.create({
					userId,
					weekStartsAt: nextWeek().startsAt,
					timezone: MACHINE_TIMEZONE,
					slots: [evening],
				});
			}

			await factories.ScrimPostFactory.create({
				users: await createGroup(factories),
				startsAt: evening.startsAt,
				isScheduledForFuture: true,
			});

			await impersonate(page, NZAP_TEST_ID);

			const scrims = new ScrimsPage(page);
			await scrims.goto();
			await scrims.openTab("available");

			await expect(scrims.locators.fitIndicator).toContainText("3/4 available");

			await scrims.locators.fitIndicator.click();

			await expect(scrims.availabilityRow(NZAP_TEST_ID)).toHaveAttribute(
				"data-status",
				"available",
			);
			await expect(scrims.availabilityRow(withoutSchedule)).toHaveAttribute(
				"data-status",
				"unknown",
			);

			await page.keyboard.press("Escape");
			await scrims.requestFirst();

			// the same breakdown, for the slot the request would be made for
			await expect(scrims.availabilityRow(NZAP_TEST_ID)).toHaveAttribute(
				"data-status",
				"available",
			);
		});
	});
});

/** A tournament with a map pool, which a scrim can play its maps off. */
function createTournament(factories: Factories) {
	return factories.TournamentFactory.create({
		authorId: ADMIN_ID,
		name: TOURNAMENT_NAME,
		startTimes: [dateToDatabaseTimestamp(addDays(new Date(), 1))],
		mapPoolMaps: TOURNAMENT_MAP_POOL,
	});
}

/** Users a user search finds by the name given to them. */
function createNamedUsers(factories: Factories, names: string[]) {
	return factories.UserFactory.createMany(names.length, (index) => ({
		discordName: names[index],
	}));
}

/** 18:00 tomorrow, a start always ahead of "now". */
function tomorrowEvening() {
	return startOfHour(setHours(addDays(new Date(), 1), 18));
}

async function createTeamFor(factories: Factories, userId: number) {
	const teammates = await factories.UserFactory.createMany(GROUP_SIZE - 1);

	return factories.TeamFactory.create({
		memberUserIds: [userId, ...teammates.map((user) => user.id)],
	});
}

function nextWeek() {
	return Availability.weekRange(addWeeks(new Date(), 1), MACHINE_TIMEZONE);
}

/** Wall-clock range on a day of next week, so it is always ahead of "now". */
function nextWeekSlot(dayIndex: number, start: string, end: string) {
	const date = Availability.dateInTimezone(
		nextWeek().startsAt + dayIndex * DAY_SECONDS + DAY_SECONDS / 2,
		MACHINE_TIMEZONE,
	);
	const at = (time: string) =>
		Availability.localToTimestamp({ date, time, timezone: MACHINE_TIMEZONE });

	return { startsAt: at(start), endsAt: at(end) };
}

/** A pick-up sized group of users, `userId` its owner if one is given. */
async function createGroup(factories: Factories, userId?: number) {
	const others = await factories.UserFactory.createMany(
		userId ? GROUP_SIZE - 1 : GROUP_SIZE,
	);
	const userIds = userId
		? [userId, ...others.map((user) => user.id)]
		: others.map((user) => user.id);

	return userIds.map((id, index) => ({
		userId: id,
		isOwner: toDBBoolean(index === 0),
	}));
}

/** A scrim post with one request made to it, booked when `isAccepted`. */
async function createPostWithRequest(
	factories: Factories,
	{
		ownerUserId,
		requesterUserId,
		at,
		mapsTournamentId,
		isAccepted,
	}: {
		ownerUserId: number;
		requesterUserId?: number;
		at?: Date;
		mapsTournamentId?: number;
		isAccepted?: boolean;
	},
) {
	const users = await createGroup(factories, ownerUserId);
	const requesters = await createGroup(factories, requesterUserId);

	return factories.ScrimPostFactory.create(
		{
			users,
			startsAt: dateToDatabaseTimestamp(at ?? new Date()),
			isScheduledForFuture: Boolean(at),
			mapsTournamentId: mapsTournamentId ?? null,
		},
		{ requests: [{ users: requesters, isAccepted }] },
	);
}

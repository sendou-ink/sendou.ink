import { addDays, addHours, setHours, setMinutes, startOfHour } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
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
	navigate,
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
const GROUP_SIZE = 4;
const TOURNAMENT_MAP_POOL: Array<{ mode: ModeShort; stageId: StageId }> = [
	{ mode: "SZ", stageId: 1 },
	{ mode: "TC", stageId: 2 },
	{ mode: "RM", stageId: 3 },
	{ mode: "CB", stageId: 4 },
];

test.describe("Scrims", () => {
	test("creates a new scrim & deletes it", async ({ page, factories }) => {
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

	test("requests an existing scrim post & cancels the request", async ({
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

	test("accepts a request", async ({ page, factories }) => {
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

		const bookedAt = startOfHour(setHours(addDays(new Date(), 1), 18));
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

	test("creates scrim with start time and tournament maps, accepts with time and message", async ({
		page,
		factories,
	}) => {
		await createTeamFor(factories, ADMIN_ID);
		await createNamedUsers(factories, PICKUP_NAMES);
		await createTournament(factories);

		await impersonate(page, ADMIN_ID);

		const newPost = new NewScrimPostPage(page);
		await newPost.goto();
		await newPost.form.setDateTime(
			"at",
			startOfHour(setHours(addDays(new Date(), 1), 18)),
		);
		await newPost.form.select("rangeEnd", "+2hours");
		await newPost.selectTournamentMaps(TOURNAMENT_NAME);
		await newPost.save();

		await impersonate(page, NZAP_TEST_ID);

		const scrims = new ScrimsPage(page);
		await scrims.goto();
		await scrims.openTab("available");

		const request = await scrims.requestFirst();
		await request.selectPickupUsers(PICKUP_NAMES);
		await request.selectStartTime(1);
		await request.form.fill("message", "Ready to scrim! Let's do this.");
		await request.send();

		// back as the author, who sees the post and the request details
		await impersonate(page, ADMIN_ID);
		await scrims.goto();

		const notifications = new NotificationPopover(page);
		await notifications.open();

		await expect(
			notifications.notification("N-ZAP requested a scrim"),
		).toBeVisible();

		await notifications.close();

		await expect(scrims.post("+2h")).toBeVisible();
		await expect(scrims.locators.tournamentPopover).toBeVisible();
		await expect(scrims.post("Ready to scrim! Let's do this.")).toBeVisible();

		await scrims.acceptFirstRequest();
		await scrims.openTab("booked");

		const scrim = await scrims.openFirstBookedScrim();
		await scrim.openTab("action");

		await expect(scrim.locators.mapListForm).toBeVisible();
	});

	test("map-by-map: lists, report, undo, replay, change list, stats", async ({
		page,
		factories,
	}) => {
		const tournament = await createTournament(factories);
		const post = await createPostWithRequest(factories, {
			ownerUserId: ADMIN_ID,
			requesterUserId: NZAP_TEST_ID,
			mapsTournamentId: tournament.id,
			isAccepted: true,
		});

		// the admin opens the Action tab — the map list form is shown immediately
		await impersonate(page, ADMIN_ID);

		const scrim = new ScrimPage(page);
		await scrim.goto(post.id);
		await scrim.openTab("action");

		await expect(scrim.locators.mapListForm).toBeVisible();

		// the post's tournament is the default source for the author's side, so they
		// can submit without running the tournament search. A first map is generated
		// immediately, so the page moves on to the report UI with the map-list
		// manager collapsed.
		await scrim.submitMapList();

		await expect(scrim.locators.reportScoreButton).toBeVisible();

		await scrim.openMapListManager();

		await expect(scrim.mapListRow("ALPHA")).toContainText(TOURNAMENT_NAME);

		// N-ZAP submits a pool-URL-based map list. They have no list yet, so the
		// map-list manager is already expanded on mount.
		await impersonate(page, NZAP_TEST_ID);
		await scrim.goto(post.id);
		await scrim.openTab("action");
		await scrim.submitPoolMapList(TEST_POOL_SERIALIZED);

		await expect(scrim.locators.reportScoreButton).toBeVisible();
		await expect(scrim.mapListRow("BRAVO")).toContainText("Pool");

		// map 1: ALPHA wins → next map auto-generated
		await scrim.reportMapWinner("ALPHA");
		await expect(scrim.locators.reportScoreButton).toBeVisible();

		// map 2: BRAVO wins → next map auto-generated
		await scrim.reportMapWinner("BRAVO");
		await expect(scrim.locators.reportScoreButton).toBeVisible();

		// map 3: ALPHA wins → undo (un-reports map 3, deletes auto-gen map 4)
		await scrim.reportMapWinner("ALPHA");
		await expect(scrim.locators.undoMapButton).toBeVisible();
		await scrim.undoMap();
		await expect(scrim.locators.reportScoreButton).toBeVisible();

		// re-report map 3 as BRAVO wins → next map auto-generated
		await scrim.reportMapWinner("BRAVO");

		// replaying replaces the generated map with a copy of the previous one
		await expect(scrim.locators.replayMapButton).toBeVisible();
		await scrim.replayMap();
		await scrim.reportMapWinner("ALPHA");

		// back as the admin to change their list
		await impersonate(page, ADMIN_ID);
		await scrim.goto(post.id);
		await scrim.openTab("action");
		await scrim.openMapListManager();

		await scrim.removeOwnMapList("ALPHA");

		await expect(scrim.locators.mapListForm).toBeVisible();

		await scrim.submitPoolMapList(TEST_POOL_SERIALIZED);

		await expect(scrim.mapListRow("ALPHA")).toContainText("Pool");

		await scrim.openTab("stats");

		await expect(scrim.locators.statsRoot).toBeVisible();

		// four reported maps in total (2 wins & 2 losses from the admin's point of view)
		await scrim.showModeStatsOfAllMaps();

		expect(await scrim.reportedMapCount()).toBe(4);
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

async function createTeamFor(factories: Factories, userId: number) {
	const teammates = await factories.UserFactory.createMany(GROUP_SIZE - 1);

	return factories.TeamFactory.create({
		memberUserIds: [userId, ...teammates.map((user) => user.id)],
	});
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

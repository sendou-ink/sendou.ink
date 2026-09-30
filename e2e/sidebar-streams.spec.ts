import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { tournamentStreamsPage, twitchUrl } from "~/utils/urls";
import {
	expect,
	expectNoErrorPage,
	impersonate,
	test,
} from "./helpers/playwright";
import {
	createNamedUsers,
	createUserIds,
	expectTopToBottom,
	inDays,
	LOGGED_OUT_FRIENDS_TEXT,
	NO_EVENTS_TEXT,
	NO_STREAMS_TEXT,
} from "./helpers/sidebar";
import { createInProgressMatch } from "./helpers/tournament";
import { FrontPage } from "./pages/front-page/front-page";
import { SideNav } from "./pages/layout/side-nav";
import { TournamentStreamsPage } from "./pages/tournament/tournament-streams-page";

const XRANK_TWITCH = "xrank_streamer";
const TOP_PLAYER_XP = 4000;

test.describe("Sidebar streams", () => {
	test("live tournament streams link to the tournament's streams page", async ({
		page,
		factories,
	}) => {
		const [streamer] = await createNamedUsers(factories, [
			"TournamentStreamer",
		]);
		const { tournament } = await createInProgressMatch(factories, {
			name: "Streamed Tournament",
			friendId: streamer.id,
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: streamer.id }]);

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.itemBadge("Streamed Tournament")).toHaveText("LIVE");
		await expect(sideNav.itemSubtitle("Streamed Tournament")).not.toBeEmpty();

		await sideNav.streamItem("Streamed Tournament").click();
		await expect(page).toHaveURL(tournamentStreamsPage(tournament.id));

		await expect(
			new TournamentStreamsPage(page).locators.streams.first(),
		).toBeVisible();
	});

	test("x rank streamers link straight to Twitch", async ({
		page,
		factories,
	}) => {
		const [topPlayer] = await createNamedUsers(factories, ["TopPlayer"], {
			twitch: XRANK_TWITCH,
		});
		await factories.XRankPlacementFactory.create(
			{ playerUserId: topPlayer.id, power: TOP_PLAYER_XP },
			{ refreshPeakXp: true },
		);
		await factories.LiveStreamFactory.replaceAll([
			{ userId: topPlayer.id, twitch: XRANK_TWITCH },
		]);

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.itemSubtitle("TopPlayer")).toHaveText(
			String(TOP_PLAYER_XP),
		);
		await expect(sideNav.streamItem("TopPlayer")).toHaveAttribute(
			"href",
			twitchUrl(XRANK_TWITCH),
		);
	});

	test("upcoming tournaments sit under the Upcoming divider and can be saved", async ({
		page,
		factories,
	}) => {
		const [topPlayer] = await createNamedUsers(factories, ["TopPlayer"], {
			twitch: XRANK_TWITCH,
		});
		await factories.XRankPlacementFactory.create(
			{ playerUserId: topPlayer.id, power: TOP_PLAYER_XP },
			{ refreshPeakXp: true },
		);
		await factories.LiveStreamFactory.replaceAll([
			{ userId: topPlayer.id, twitch: XRANK_TWITCH },
		]);

		await factories.TournamentFactory.create(
			{
				authorId: ADMIN_ID,
				name: "Upcoming Tournament",
				startTimes: [inDays(2)],
			},
			{ tier: 1 },
		);

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expectTopToBottom([
			sideNav.streamItem("TopPlayer"),
			sideNav.locators.upcomingDivider,
			sideNav.streamItem("Upcoming Tournament"),
		]);
		await expect(sideNav.itemTier("Upcoming Tournament")).toBeVisible();

		await sideNav.saveStream("Upcoming Tournament");
		await expect(sideNav.savedStreamIcon("Upcoming Tournament")).toBeVisible();
		await expect(sideNav.eventItem("Upcoming Tournament")).toHaveCount(2);

		await sideNav.saveStream("Upcoming Tournament");
		await expect(sideNav.savedStreamIcon("Upcoming Tournament")).toHaveCount(0);
		await expect(sideNav.eventItem("Upcoming Tournament")).toHaveCount(1);
	});

	test("shows at most five streams, best first", async ({
		page,
		factories,
	}) => {
		const [highTierStreamer, lowTierStreamer, sendouQStreamer] =
			await createNamedUsers(factories, [
				"HighTierStreamer",
				"LowTierStreamer",
				"SendouQStreamer",
			]);

		await createInProgressMatch(factories, {
			name: "High Tier Tournament",
			friendId: highTierStreamer.id,
			tier: 1,
		});
		await createInProgressMatch(factories, {
			name: "Low Tier Tournament",
			friendId: lowTierStreamer.id,
			tier: 3,
		});
		await factories.SQMatchFactory.create({
			alphaUserIds: [
				sendouQStreamer.id,
				...(await createUserIds(factories, 3)),
			],
			bravoUserIds: await createUserIds(factories, 4),
		});
		await factories.LiveStreamFactory.replaceAll([
			{ userId: highTierStreamer.id },
			{ userId: lowTierStreamer.id },
			{ userId: sendouQStreamer.id },
		]);

		for (const nth of [1, 2, 3]) {
			await factories.TournamentFactory.create(
				{
					authorId: ADMIN_ID,
					name: `Upcoming Tournament ${nth}`,
					startTimes: [inDays(1)],
				},
				{ tier: 1 },
			);
		}

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.locators.listItems).toHaveCount(5);
		await expectTopToBottom([
			sideNav.streamItem("High Tier Tournament"),
			sideNav.streamItem("Low Tier Tournament"),
			sideNav.locators.upcomingDivider,
		]);
	});

	test("shows an empty state without streams", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		await expect(new SideNav(page).emptyText(NO_STREAMS_TEXT)).toBeVisible();
	});

	test("shows streams to logged out visitors", async ({ page, factories }) => {
		const [streamer] = await createNamedUsers(factories, [
			"TournamentStreamer",
		]);
		const { tournament } = await createInProgressMatch(factories, {
			name: "Streamed Tournament",
			friendId: streamer.id,
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: streamer.id }]);

		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.emptyText(NO_EVENTS_TEXT)).toBeVisible();
		await expect(sideNav.emptyText(LOGGED_OUT_FRIENDS_TEXT)).toBeVisible();

		await sideNav.streamItem("Streamed Tournament").click();
		await expect(page).toHaveURL(tournamentStreamsPage(tournament.id));
		await expectNoErrorPage(page);
	});
});

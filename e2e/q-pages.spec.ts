import { sendouQMatchPage } from "~/utils/urls";
import { expect, expectNoErrorPage, test } from "./helpers/playwright";
import { createNamedUsers, createUserIds } from "./helpers/sidebar";
import { QInfoPage } from "./pages/sendouq/q-info-page";
import { QRulesPage } from "./pages/sendouq/q-rules-page";
import { QStreamsPage } from "./pages/sendouq/q-streams-page";
import { TiersPage } from "./pages/sendouq/tiers-page";

const STREAMER_TWITCH = "q_streamer";
const STREAM_VIEWER_COUNT = 777;

test.describe("SendouQ pages", () => {
	test("streams page shows the empty state, then a seeded live match", async ({
		page,
		factories,
	}) => {
		const streamsPage = new QStreamsPage(page);
		await streamsPage.goto();
		await expectNoErrorPage(page);
		await expect(streamsPage.locators.noStreamsText).toBeVisible();

		const [streamer] = await createNamedUsers(factories, ["QStreamer"], {
			twitch: STREAMER_TWITCH,
		});
		const match = await factories.SQMatchFactory.create({
			alphaUserIds: [streamer.id, ...(await createUserIds(factories, 3))],
			bravoUserIds: await createUserIds(factories, 4),
		});
		await factories.LiveStreamFactory.replaceAll([
			{
				userId: streamer.id,
				twitch: STREAMER_TWITCH,
				viewerCount: STREAM_VIEWER_COUNT,
			},
		]);

		await streamsPage.goto();

		await expect(streamsPage.streamerLink("QStreamer")).toBeVisible();
		await expect(streamsPage.matchLink(match.id)).toHaveAttribute(
			"href",
			sendouQMatchPage(match.id),
		);
		await expect(streamsPage.twitchLink(STREAMER_TWITCH)).toBeVisible();
		await expect(streamsPage.viewerCount(STREAM_VIEWER_COUNT)).toBeVisible();
	});

	test("rules, info and tiers pages render their content", async ({ page }) => {
		const rulesPage = new QRulesPage(page);
		await rulesPage.goto();
		await expectNoErrorPage(page);
		await expect(rulesPage.locators.heading).toBeVisible();

		const infoPage = new QInfoPage(page);
		await infoPage.goto();
		await expectNoErrorPage(page);
		await expect(infoPage.locators.generalInfoHeading).toBeVisible();

		const tiersPage = new TiersPage(page);
		await tiersPage.goto();
		await expectNoErrorPage(page);
		await expect(tiersPage.tierImage("LEVIATHAN")).toBeVisible();
		await expect(tiersPage.tierImage("IRON")).toBeVisible();
	});
});

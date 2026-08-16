import { addHours, subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { TournamentAdminPage } from "./pages/tournament/tournament-admin-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentStreamsPage } from "./pages/tournament/tournament-streams-page";

const ROSTER_SIZE = 4;
const CAST_ACCOUNT = "test_cast_stream";
const STREAM_VIEWER_COUNT = 150;

test.describe("Tournament streams", () => {
	test("can set cast twitch accounts in admin", async ({ page, factories }) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			startTimes: [dateToDatabaseTimestamp(addHours(new Date(), 2))],
		});

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		const stream = await admin.openStream();

		await stream.fillAccount(0, CAST_ACCOUNT);
		await stream.addAccountField();
		await stream.fillAccount(1, "another_cast");
		await stream.save();

		// Verify persistence by navigating away and back
		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);
		await stream.goto(tournament.id);

		await expect(stream.accountInput(0)).toHaveValue(CAST_ACCOUNT);
		await expect(stream.accountInput(1)).toHaveValue("another_cast");
	});

	test("can view streams on bracket popover when match is in progress", async ({
		page,
		factories,
	}) => {
		const { tournament, players } = await createStartableTournament(factories);
		await factories.LiveStreamFactory.replaceAll([
			{ userId: players[0].id, viewerCount: STREAM_VIEWER_COUNT },
		]);
		const matches = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		await impersonate(page, NZAP_TEST_ID);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const match = await brackets.openMatch(matches[0].id);
		// Report partial score to set startedAt (match becomes "in progress")
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });
		await match.backToBracket();

		// The LIVE button should be visible since a match participant is streaming
		await expect(brackets.locators.liveBadges.first()).toBeVisible();

		await brackets.locators.liveBadges.first().click();

		await expect(brackets.locators.streamPopover).toBeVisible();
		await expect(brackets.locators.streamPopoverStreams.first()).toBeVisible();
	});

	test("can view streams on streams page", async ({ page, factories }) => {
		const { tournament, players } = await createStartableTournament(factories);
		await factories.LiveStreamFactory.replaceAll([
			{ userId: players[0].id, viewerCount: STREAM_VIEWER_COUNT },
		]);
		await factories.TournamentFactory.startBracket(tournament.id);

		const streams = new TournamentStreamsPage(page);
		await streams.goto(tournament.id);

		await expect(streams.locators.streams.first()).toBeVisible();

		await expect(
			streams.viewerCount(STREAM_VIEWER_COUNT).first(),
		).toBeVisible();
	});

	test("cast stream shows on bracket when match is set as casted", async ({
		page,
		factories,
	}) => {
		const { tournament } = await createStartableTournament(factories);
		await factories.LiveStreamFactory.replaceAll([
			{ userId: null, twitch: CAST_ACCOUNT },
		]);

		await impersonate(page, NZAP_TEST_ID);

		const admin = new TournamentAdminPage(page);
		await admin.goto(tournament.id);
		const stream = await admin.openStream();
		await stream.fillAccount(0, CAST_ACCOUNT);
		await stream.save();

		const matches = await factories.TournamentFactory.startBracket(
			tournament.id,
		);

		const brackets = new TournamentBracketsPage(page);
		await brackets.goto(tournament.id);

		const match = await brackets.openMatch(matches[0].id);
		await match.openTab("action");
		await match.reportResult({ mapsToReport: 1, setEnds: false });

		await match.openTab("admin");
		await match.setCastedBy(CAST_ACCOUNT);
		await match.backToBracket();

		await expect(brackets.locators.liveBadges.first()).toBeVisible();
	});
});

/** A started-but-bracketless tournament with two checked-in full rosters. */
async function createStartableTournament(factories: Factories) {
	const tournament = await factories.TournamentFactory.create({
		authorId: NZAP_TEST_ID,
		startTimes: [dateToDatabaseTimestamp(subMinutes(new Date(), 30))],
	});
	const players = await factories.UserFactory.createMany(ROSTER_SIZE * 2);
	for (const roster of [
		players.slice(0, ROSTER_SIZE),
		players.slice(ROSTER_SIZE),
	]) {
		await factories.TournamentTeamFactory.create(
			{
				tournamentId: tournament.id,
				memberUserIds: roster.map((user) => user.id),
			},
			{ isCheckedIn: true },
		);
	}

	return { tournament, players };
}

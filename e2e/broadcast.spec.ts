import type { Browser } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { ROSTER_SIZE, startedTournamentTimes } from "./helpers/tournament";
import { BroadcastDashboardPage } from "./pages/broadcast/broadcast-dashboard-page";
import { BroadcastDesignPage } from "./pages/broadcast/broadcast-design-page";
import { BroadcastProgramPage } from "./pages/broadcast/broadcast-program-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

const CAST_ACCOUNT = "broadcast_cast";
const TEAM_COUNT = 2;

test.describe("Broadcast", () => {
	test("casts a match, takes scenes, edits the queue and holds next", async ({
		page,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
			isMatchCast: false,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		await expect(dashboard.locators.noFeaturedMatch).toBeVisible();

		const match = new TournamentMatchPage(page);
		await match.goto({
			tournamentId: tournament.id,
			matchId: tournament.matchId,
		});
		await match.openTab("admin");
		await match.setCastedBy(CAST_ACCOUNT);

		await dashboard.goto();
		await expect(dashboard.locators.featuredMatch).toContainText("Team 1");
		await expect(dashboard.locators.featuredMatch).toContainText("Team 2");
		await expect(dashboard.viewHeading("live", "rosters")).toBeVisible();
		await expect(dashboard.viewHeading("next", "game")).toBeVisible();

		await expect(dashboard.locators.onGameStart).toBeVisible();
		await dashboard.hold();
		await expect(dashboard.locators.onGameStart).toBeHidden();
		await expect(dashboard.locators.holdButton).toBeHidden();

		await dashboard.take();
		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
		await expect(dashboard.viewHeading("next", "results")).toBeVisible();

		await dashboard.queueScene();
		await expect(dashboard.queueItem(1)).toBeVisible();
		await dashboard.pickScene("bracket");
		await expect(dashboard.queueItem(1)).toContainText("Bracket");

		await dashboard.selectQueueItem(0);
		await dashboard.removeQueueItem(0);
		await expect(dashboard.queueItem(1)).toBeHidden();
		await expect(dashboard.viewHeading("next", "bracket")).toBeVisible();

		await dashboard.take();
		await expect(dashboard.viewHeading("live", "bracket")).toBeVisible();
	});

	test("cuts to the game on the program when the scanner sees it start", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.scene("rosters")).toBeVisible();

		expect(await dashboard.postGameSignal({ type: "start", inks: null })).toBe(
			200,
		);

		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
		await expect(obs.program.scene("game")).toBeVisible();

		await obs.close();
	});

	test("shows a saved theme on the program", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.locators.canvas).not.toHaveCSS(
			"outline-width",
			"7px",
		);

		await dashboard.saveTheme(
			"[data-broadcast] { outline: 7px solid rgb(1, 2, 3); }",
		);

		await expect(obs.program.locators.canvas).toHaveCSS("outline-width", "7px");

		await obs.close();
	});

	test("loads a preset in the designer to edit and shows it on the program", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const design = new BroadcastDesignPage(page, pageArgs(tournament.id));
		await design.goto();
		await expect(design.locators.presetSelect).toContainText("Default");

		await design.pickPreset("Zine");
		await expect(design.locators.presetSelect).toContainText("Zine");
		await expect(design.locators.editor).toHaveValue(/ZINE/);

		const presetCss = await design.locators.editor.inputValue();
		await design.locators.editor.fill(
			`${presetCss}\n[data-broadcast] { outline: 7px solid rgb(1, 2, 3); }`,
		);
		await expect(design.locators.presetSelect).toContainText("Your own");
		await design.save();

		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.locators.canvas).toHaveCSS("outline-width", "7px");
		await expect(obs.program.locators.canvas).toHaveCSS(
			"color",
			"rgb(20, 20, 20)",
		);

		await design.pickPreset("Teletext");
		await design.locators.confirmPresetButton.click();
		await expect(design.locators.presetSelect).toContainText("Teletext");
		await expect(design.locators.editor).toHaveValue(/TELETEXT/);

		await obs.close();
	});

	test("keeps everyone but producers out of producing", async ({
		page,
		factories,
	}) => {
		const [organizer] = await factories.UserFactory.createMany(1);
		const tournament = await createBroadcasting(factories, {
			authorId: organizer.id,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		const program = new BroadcastProgramPage(page, pageArgs(tournament.id));

		expect(await dashboard.responseStatus()).toBe(404);
		expect(await dashboard.postGameSignal({ type: "start", inks: null })).toBe(
			404,
		);
		expect(await program.responseStatus(null)).toBe(404);
		expect(await program.responseStatus(tournament.programKey)).toBe(200);
		expect(
			await program.refusedStreamStatus({
				role: "scanner",
				programKey: tournament.programKey,
			}),
		).toBe(404);
	});
});

function pageArgs(tournamentId: number) {
	return { tournamentId, slug: CAST_ACCOUNT };
}

/** The setup of the `tournament-broadcast` dev scenario: two teams, their match cast on the channel, the program URL generated. */
async function createBroadcasting(
	factories: Factories,
	{ authorId, isMatchCast }: { authorId: number; isMatchCast?: boolean },
) {
	const players = await factories.UserFactory.createMany(
		TEAM_COUNT * ROSTER_SIZE,
	);

	return factories.TournamentFactory.createBroadcasting(
		{ authorId, startTimes: startedTournamentTimes() },
		{
			teamRosters: Array.from({ length: TEAM_COUNT }, (_, idx) =>
				players
					.slice(idx * ROSTER_SIZE, (idx + 1) * ROSTER_SIZE)
					.map((player) => player.id),
			),
			twitchAccount: CAST_ACCOUNT,
			isMatchCast,
		},
	);
}

/** The program in a browser of its own with no session, as OBS shows it from the keyed URL. */
async function openObsSource({
	browser,
	baseURL,
	tournamentId,
	programKey,
}: {
	browser: Browser;
	baseURL: string;
	tournamentId: number;
	programKey: string;
}) {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1920, height: 1080 },
	});
	const program = new BroadcastProgramPage(
		await context.newPage(),
		pageArgs(tournamentId),
	);
	await program.goto(programKey);

	return { program, close: () => context.close() };
}

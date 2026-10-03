import type { StageId } from "~/modules/in-game-lists/types";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { FakeCaptureCard } from "./pages/scanner/fake-capture-card";
import { FIXTURE_GAME } from "./pages/scanner/fixture-game";
import { ScannerPage } from "./pages/scanner/scanner-page";
import { SendouQMatchPage } from "./pages/sendouq/sendouq-match-page";

/** Loading OpenCV and reading a screen at the live sample rate outlast the default timeout. */
const SCAN_TIMEOUT = 45_000;

/** The fixture game first, then maps nobody plays. */
const SET_STAGE_IDS: StageId[] = [FIXTURE_GAME.stageId, 0, 1, 2, 4, 5, 6];

test.describe("Scanner live capture", () => {
	test.describe.configure({ timeout: 120_000 });

	test("captures a game from a capture card into a session", async ({
		page,
	}) => {
		const capture = new FakeCaptureCard(page);
		await capture.install();
		const scanner = new ScannerPage(page);
		await scanner.goto();

		await startCapture(scanner);
		await playFixtureGame(scanner, capture);
		await expectCapturedGame(scanner);

		await scanner.locators.stopButton.click();
		await scanner.locators.liveSessionLinks.first().click();

		await expectCapturedGame(scanner);
	});

	test("uploads a captured game, linking it to the SendouQ match it was played in", async ({
		page,
		factories,
	}) => {
		const winners = await createPlayers(factories, FIXTURE_GAME.winners);
		const losers = await createPlayers(factories, FIXTURE_GAME.losers);
		const match = await factories.SQMatchFactory.create(
			{
				alphaUserIds: winners.map((user) => user.id),
				bravoUserIds: losers.map((user) => user.id),
				mapList: SET_STAGE_IDS.map((stageId) => ({
					mode: "SZ",
					stageId,
					source: "BOTH",
				})),
			},
			{ isConcluded: true },
		);
		const povUser =
			winners[FIXTURE_GAME.winners.indexOf(FIXTURE_GAME.pov.name)];

		await impersonate(page, povUser.id);
		const capture = new FakeCaptureCard(page);
		await capture.install();
		const scanner = new ScannerPage(page);
		await scanner.goto();

		await startCapture(scanner);
		await playFixtureGame(scanner, capture);

		await scanner.uploadStatusButton("Uploaded to sendou.ink").click();
		await expect(scanner.locators.openMatchLink).toHaveAttribute(
			"href",
			new RegExp(`/q/match/${match.id}$`),
		);

		const matchPage = new SendouQMatchPage(page);
		await matchPage.goto(match.id, "result");
		await matchPage.locators.scoreboardDetailsButton.first().click();
		await expect(matchPage.scoreboardRow(FIXTURE_GAME.pov.name)).toContainText(
			`${FIXTURE_GAME.pov.ka}${FIXTURE_GAME.pov.d}${FIXTURE_GAME.pov.s}`,
		);
	});

	test("refuses to capture in a second tab while one is capturing", async ({
		page,
		context,
	}) => {
		const capture = new FakeCaptureCard(page);
		await capture.install();
		const scanner = new ScannerPage(page);
		await scanner.goto();
		await startCapture(scanner);

		const secondTab = await context.newPage();
		await new FakeCaptureCard(secondTab).install();
		const secondScanner = new ScannerPage(secondTab);
		await secondScanner.goto();
		await secondScanner.locators.startCaptureButton.click();

		await expect(secondScanner.locators.anotherTabCapturingError).toBeVisible();
	});

	test("tells when no capture card is connected", async ({ page }) => {
		await new FakeCaptureCard(page).install({ kind: "webcam" });
		const scanner = new ScannerPage(page);
		await scanner.goto();

		await scanner.locators.startCaptureButton.click();

		await expect(scanner.locators.noCaptureSourceError).toBeVisible();
	});
});

/** Users with the given scoreboard names as their in-game names. */
async function createPlayers(factories: Factories, names: readonly string[]) {
	const users: Array<{ id: number }> = [];
	for (const name of names) {
		users.push(
			await factories.UserFactory.create({
				profile: { inGameName: `${name}#1234` },
			}),
		);
	}
	return users;
}

async function startCapture(scanner: ScannerPage) {
	await scanner.locators.startCaptureButton.click();
	await expect(scanner.locators.stopButton).toBeVisible({
		timeout: SCAN_TIMEOUT,
	});
}

/** The intro until the scanner reads it, a black transition, then the results screen until its card shows. */
async function playFixtureGame(scanner: ScannerPage, capture: FakeCaptureCard) {
	await capture.show("intro");
	await expect(scanner.locators.main).toContainText(
		`Game started: ${FIXTURE_GAME.mode} on ${FIXTURE_GAME.stage}`,
		{ timeout: SCAN_TIMEOUT },
	);
	await capture.show(null);
	await capture.show("results");
	await expect(scanner.locators.main).toContainText("WIN", {
		timeout: SCAN_TIMEOUT,
	});
}

async function expectCapturedGame(scanner: ScannerPage) {
	for (const text of FIXTURE_GAME.card) {
		await expect(scanner.locators.main).toContainText(text);
	}
}

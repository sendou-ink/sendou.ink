import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { LogInPopover } from "./pages/layout/log-in-popover";
import { FIXTURE_GAME, fixtureFramePath } from "./pages/scanner/fixture-game";
import { ScannerPage } from "./pages/scanner/scanner-page";
import { NewVodPage } from "./pages/vods/new-vod-page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One game: its intro on screen 0:03–0:09, then its results screen; built by scripts/scanner/build-e2e-vod.sh */
const VOD_NAME = "scanner-vod.webm";
const VOD_PATH = path.join(__dirname, "fixtures", VOD_NAME);
const SCOREBOARD_SCREENSHOT_PATH = fixtureFramePath("results");

const GAME = FIXTURE_GAME;

/**
 * A game starts at its best intro read, which can come a moment after the
 * intro appears (a still sharpens over the first frames after a keyframe).
 */
const INTRO_SECONDS = { from: 3, to: 9 };
const INTRO_TIMESTAMP = /^0:0[3-8]$/;

/** Loading OpenCV and scanning outlast the default timeout. */
const SCAN_TIMEOUT = 45_000;

test.describe("Scanner", () => {
	test.describe.configure({ timeout: 90_000 });

	test("reads a screenshot in the debug view", async ({ page }) => {
		const scanner = new ScannerPage(page);
		await scanner.goto();

		await scanner.chooseFile(SCOREBOARD_SCREENSHOT_PATH);

		await expect(scanner.locators.main).toContainText(
			`scores [85,82] · ${GAME.lobby} · ${GAME.mode} · ${GAME.stage}`,
			{ timeout: SCAN_TIMEOUT },
		);
	});

	test("scans a file into a match card that survives a reload", async ({
		page,
	}) => {
		const scanner = new ScannerPage(page);
		await scanVod(scanner);

		await expectScannedGame(scanner);
		await scanner.locators.showDetailsButton.click();
		for (const player of [...GAME.winners, ...GAME.losers]) {
			await expect(scanner.locators.main).toContainText(player);
		}

		await scanner.reload();
		await expectScannedGame(scanner);

		await scanner.goto();
		await scanner.sessionLink(VOD_NAME).click();
		await expectScannedGame(scanner);
	});

	test("exports the scanned matches as CSV", async ({ page }) => {
		const scanner = new ScannerPage(page);
		await scanVod(scanner);

		const download = await scanner.downloadMatchesCsv();
		const [header, row, ...rest] = (
			await fs.readFile(await download.path(), "utf-8")
		)
			.trim()
			.split(/\r?\n/)
			.map((line) => line.split(","));

		const game = Object.fromEntries(header.map((key, i) => [key, row[i]]));

		expect(rest).toHaveLength(0);
		expect(Number(game.t_seconds)).toBeGreaterThanOrEqual(INTRO_SECONDS.from);
		expect(Number(game.t_seconds)).toBeLessThan(INTRO_SECONDS.to);
		expect(game).toEqual(
			expect.objectContaining({
				source: VOD_NAME,
				lobby: GAME.lobby,
				mode: GAME.mode,
				stage: GAME.stage,
				result: "WIN",
				score_for: "85",
				score_against: "82",
				weapon: GAME.pov.weapon,
				ka: String(GAME.pov.ka),
				d: String(GAME.pov.d),
				s: String(GAME.pov.s),
			}),
		);
	});

	test("downloads a scanned game's frames and reads as a zip", async ({
		page,
	}) => {
		const scanner = new ScannerPage(page);
		await scanVod(scanner);
		await scanner.locators.showDetailsButton.click();

		const download = await scanner.downloadGameData();
		const files = unzipSync(await fs.readFile(await download.path()));
		const names = Object.keys(files);
		const events = JSON.parse(strFromU8(files["events.json"]!));

		expect(names).toContain("match.json");
		expect(
			names.some((name) =>
				/^frames\/[^/]+-MapStart-[^/]+\/frame\.webp$/.test(name),
			),
		).toBe(true);
		expect(
			events.some(
				(event: { type: string; frame?: string }) =>
					event.type === "MapStart" &&
					files[`${event.frame}/expected.json`] !== undefined,
			),
		).toBe(true);
	});

	test("prefills a new VoD from a scanned file", async ({
		page,
		factories,
	}) => {
		await factories.UserFactory.grant(NZAP_TEST_ID, { roles: ["VIDEO_ADDER"] });
		await impersonate(page, NZAP_TEST_ID);
		const scanner = new ScannerPage(page);
		await scanVod(scanner);

		await scanner.locators.addToVodsButton.click();

		const newVodMatch = new NewVodPage(page).match(0);
		await expect(newVodMatch.locators.startsAt).toHaveValue(INTRO_TIMESTAMP);
		await expect(newVodMatch.modeRadio(GAME.mode)).toBeChecked();
		await expect(newVodMatch.locators.stageSelect).toContainText(GAME.stage);
		await expect(newVodMatch.locators.weaponSelect).toContainText(
			GAME.pov.weapon,
		);
	});

	test("asks a logged out visitor to log in before adding a scanned file to VoDs", async ({
		page,
	}) => {
		const scanner = new ScannerPage(page);
		await scanVod(scanner);

		await scanner.locators.addToVodsLoggedOutButton.click();

		await expect(new LogInPopover(page).locators.logInButton).toBeVisible();
	});

	test("deletes a scanned file", async ({ page }) => {
		const scanner = new ScannerPage(page);
		await scanVod(scanner);

		await scanner.deleteScan();

		await expect(scanner.locators.sessionsHeading).toBeVisible();
		await isNotVisible(scanner.sessionLink(VOD_NAME));
	});

	test("tells when an opened VoD is no longer saved", async ({ page }) => {
		const scanner = new ScannerPage(page);
		await scanner.gotoVod("missing.webm");

		await expect(scanner.locators.notFound).toBeVisible();
	});
});

/** Scans the test VoD and waits until the scan finishes, which is when Delete appears. */
async function scanVod(scanner: ScannerPage) {
	await scanner.goto();
	await scanner.chooseFile(VOD_PATH);
	await expect(scanner.locators.deleteButton).toBeVisible({
		timeout: SCAN_TIMEOUT,
	});
}

async function expectScannedGame(scanner: ScannerPage) {
	for (const text of GAME.card) {
		await expect(scanner.locators.main).toContainText(text);
	}
}

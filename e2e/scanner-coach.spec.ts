import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DetectedEvent } from "~/features/scanner/core/detectors/types";
import { expect, test } from "./helpers/playwright";
import { ScannerCoachPage } from "./pages/scanner/scanner-coach-page";
import { ScannerPage } from "./pages/scanner/scanner-page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** One game, its intro on screen 0:03–0:09 and no gameplay; built by scripts/scanner/build-e2e-vod.sh */
const VOD_PATH = path.join(__dirname, "fixtures", "scanner-vod.webm");
const INTRO_SECONDS = { from: 3, to: 9 };

/**
 * Two games' events off real scans' game data zips, shifted onto one
 * timeline: a Splat Zones game played from the POV (0:05–3:23), then a cast
 * Rainmaker game (3:35–5:06). Seeded as the scan of a blank video as long, so
 * these tests read coach mode, not the detectors.
 */
const COACH_EVENTS: DetectedEvent[] = JSON.parse(
	fs.readFileSync(
		path.join(__dirname, "fixtures", "scanner-coach-events.json"),
		"utf-8",
	),
);
const COACH_VOD_NAME = "scanner-coach-vod.webm";
const COACH_VOD_PATH = path.join(__dirname, "fixtures", COACH_VOD_NAME);
const COACH_VOD_DURATION = 315;
const CAST_GAME_STARTS_AT = 215;

test.describe("Scanner coach mode", () => {
	test.describe.configure({ timeout: 90_000 });

	test("opens a scanned file's game in coach mode and plays it again after a reload", async ({
		page,
	}) => {
		const scanner = new ScannerPage(page);
		await scanner.goto();
		await scanner.scanFile(VOD_PATH);

		await scanner.locators.openInCoachModeLink.click();

		const coach = new ScannerCoachPage(page);
		await expect(coach.locators.title).toBeVisible();
		await expect(coach.locators.gamesSummary).toHaveText("1 of 1 games");
		await expect(coach.locators.noEvents).toBeVisible();
		await expect
			.poll(() => coach.currentTime())
			.toBeGreaterThanOrEqual(INTRO_SECONDS.from);
		const startedAt = await coach.currentTime();
		expect(startedAt).toBeLessThan(INTRO_SECONDS.to);

		await coach.locators.forwardSecondsButton.click();
		await expect.poll(() => coach.currentTime()).toBeGreaterThan(startedAt + 4);

		await coach.reload();
		await expect(coach.locators.reopenPrompt).toBeVisible();
		await coach.openFile(VOD_PATH);
		await expect(coach.locators.playButton).toBeVisible();
	});

	test("steps through a saved scan's coach events and coaches a cast from either team", async ({
		page,
	}) => {
		const coach = new ScannerCoachPage(page);
		await coach.goto(COACH_VOD_NAME);
		await expect(coach.locators.notFound).toBeVisible();

		await coach.seedScan({
			name: COACH_VOD_NAME,
			duration: COACH_VOD_DURATION,
			events: COACH_EVENTS,
		});
		await coach.reload();
		await expect(coach.locators.reopenPrompt).toBeVisible();
		await coach.openFile(COACH_VOD_PATH);

		await expect(coach.locators.gamesSummary).toHaveText("2 of 2 games");
		await expect(coach.eventEntry("Special used")).toBeVisible();

		await coach.selectCategory("Zone");
		const [first, second] = [
			coach.locators.eventEntries.nth(0),
			coach.locators.eventEntries.nth(1),
		];
		await coach.locators.nextEventButton.click();
		await expect(first).toHaveAttribute("aria-current", "true");
		await expect
			.poll(async () => Math.floor(await coach.currentTime()))
			.toBe(await coach.entryPosition(first));

		await coach.locators.nextEventButton.click();
		await expect(second).toHaveAttribute("aria-current", "true");
		await expect
			.poll(async () => Math.floor(await coach.currentTime()))
			.toBe(await coach.entryPosition(second));

		await coach.filterByMode("Rainmaker");
		await expect(coach.locators.gamesSummary).toHaveText("1 of 2 games");
		await coach.locators.playButton.click();
		await expect
			.poll(() => coach.currentTime())
			.toBeGreaterThanOrEqual(CAST_GAME_STARTS_AT);

		await expect(coach.locators.castPicker).toBeVisible();
		await coach.selectCategory("Opening");
		await expect(coach.eventEntry("Opening lost")).toBeVisible();

		await coach.castTeam({ game: 2, team: "Bravo" }).click();
		await expect(coach.eventEntry("Opening won")).toBeVisible();
		await expect(coach.eventEntry("Opening lost")).toHaveCount(0);
	});
});

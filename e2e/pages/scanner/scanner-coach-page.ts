import type { Locator, Page } from "@playwright/test";
import type { DetectedEvent } from "~/features/scanner/core/detectors/types";
import { buildScannerMatches } from "~/features/scanner/core/match-builder";
import { sessionSummary } from "~/features/scanner/core/sessions";
import { scannerSearchParams } from "~/features/scanner/scanner-search-params";
import { SCANNER_PAGE } from "~/utils/urls";
import { expect, expectIsHydrated, navigate } from "../../helpers/playwright";

/** `store/db.ts` */
const SCANNER_DB_NAME = "scanner";

/** `HTMLMediaElement.HAVE_METADATA`: duration known, seeking works */
const HAVE_METADATA = 1;

/** `/scanner?view=coach&name=`, a scanned file's coach events beside its video */
export class ScannerCoachPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		const main = page.getByRole("main");
		this.locators = {
			main,
			title: main.getByText("Coach mode", { exact: true }),
			video: main.locator("video"),
			reopenPrompt: main.getByText(/again to watch it here/),
			openFileInput: main.getByLabel("Open file"),
			gamesSummary: main.getByText(/^\d+ of \d+ games$/),
			eventEntries: main
				.getByRole("list", { name: "Events" })
				.getByRole("button"),
			noEvents: main.getByText("No events were found in this file."),
			playButton: main.getByRole("button", { name: "Play", exact: true }),
			nextEventButton: main.getByRole("button", { name: "Next event" }),
			forwardSecondsButton: main.getByRole("button", {
				name: /^Forward \d+ seconds$/,
			}),
			categorySelect: main.getByRole("button", { name: "Event category" }),
			modeFilterPill: main.getByRole("button", { name: /^Mode/ }),
			modeFilterSelect: page
				.getByRole("button", { name: "Mode", exact: true })
				.and(page.locator('[aria-haspopup="listbox"]')),
			castPicker: main.getByText("Cast · coaching"),
			notFound: main.getByText("This VoD is no longer saved."),
		};
	}

	async goto(name: string) {
		await navigate({
			page: this.page,
			url: scannerSearchParams.href(SCANNER_PAGE, { view: "coach", name }),
		});
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	/**
	 * Saves `events` as an earlier visit's scan of the file `name`, as the VoD
	 * scan would. The scanner's database must already exist: open a scanner view
	 * reading it first.
	 */
	async seedScan({
		name,
		duration,
		events,
	}: {
		name: string;
		duration: number;
		events: readonly DetectedEvent[];
	}) {
		const vod = {
			name,
			savedAt: Date.now(),
			duration,
			eventCount: events.length,
			summary: sessionSummary(buildScannerMatches(events)),
		};

		await this.page.evaluate(
			([dbName, vodRecord, eventRecords]) =>
				new Promise<void>((resolve, reject) => {
					const request = indexedDB.open(dbName);
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						const database = request.result;
						const transaction = database.transaction(
							["vods", "vod-events"],
							"readwrite",
						);
						for (const event of eventRecords) {
							transaction
								.objectStore("vod-events")
								.add({ ...event, vod: vodRecord.name });
						}
						transaction.objectStore("vods").put(vodRecord);
						transaction.oncomplete = () => {
							database.close();
							resolve();
						};
						transaction.onerror = () => reject(transaction.error);
					};
				}),
			[SCANNER_DB_NAME, vod, events] as const,
		);
	}

	/** Picks the scanned file again for playback and waits until it can be seeked. */
	async openFile(filePath: string) {
		await this.locators.openFileInput.setInputFiles(filePath);
		await expect
			.poll(() =>
				this.locators.video.evaluate(
					(video: HTMLVideoElement) => video.readyState,
				),
			)
			.toBeGreaterThanOrEqual(HAVE_METADATA);
	}

	/** Seconds into the video the player is at. */
	currentTime() {
		return this.locators.video.evaluate(
			(video: HTMLVideoElement) => video.currentTime,
		);
	}

	/** An entry of the events list, by its label (e.g. "Opening lost"). */
	eventEntry(label: string) {
		return this.locators.eventEntries.filter({ hasText: label });
	}

	/** Seconds into the video an entry jumps to, as its position (its trailing M:SS) reads. */
	async entryPosition(entry: Locator) {
		const text = await entry.textContent();
		const position = text?.match(/\d+(?::\d{2}){1,2}$/)?.[0];
		if (!position) throw new Error(`No position in the entry "${text}"`);
		return position
			.split(":")
			.reduce((seconds, part) => seconds * 60 + Number(part), 0);
	}

	/** A team chip of a cast game's coaching picker. */
	castTeam({ game, team }: { game: number; team: "Alpha" | "Bravo" }) {
		const side = team === "Alpha" ? 0 : 1;
		return this.page.locator(
			`label[for="chip-radio-coach-cast-team-${game}-${side}"]`,
		);
	}

	async selectCategory(category: string) {
		await this.locators.categorySelect.click();
		await this.page
			.getByRole("option", { name: new RegExp(`^${category} \\(\\d+\\)$`) })
			.click();
	}

	async filterByMode(mode: string) {
		await this.locators.modeFilterPill.click();
		await this.locators.modeFilterSelect.click();
		await this.page.getByRole("option").filter({ hasText: mode }).click();
	}
}

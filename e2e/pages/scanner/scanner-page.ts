import type { Page } from "@playwright/test";
import { scannerSearchParams } from "~/features/scanner/scanner-search-params";
import { SCANNER_PAGE } from "~/utils/urls";
import { expectIsHydrated, navigate } from "../../helpers/playwright";

/** The settings the scanner keeps in localStorage (`components/settings.ts`). */
const SETTINGS_STORAGE_KEY = "scanner:settings";

/** `/scanner` */
export class ScannerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		const main = page.getByRole("main");
		this.locators = {
			main,
			startCaptureButton: page.getByRole("button", { name: "Start capture" }),
			stopButton: main.getByRole("button", { name: "Stop", exact: true }),
			liveSessionLinks: main.locator('a[href*="view=session"]'),
			openMatchLink: page.getByRole("link", { name: "Open match" }),
			anotherTabCapturingError: main.getByText(
				"The scanner is already capturing in another tab",
			),
			noCaptureSourceError: main.getByText(
				"No capture card or OBS Virtual Camera found",
			),
			fileInput: page.getByLabel(/Drop a video or screenshot here/),
			sessionsHeading: page.getByRole("heading", { name: "Sessions" }),
			deleteButton: main.getByRole("button", { name: "Delete", exact: true }),
			confirmDeleteButton: page.getByTestId("confirm-button"),
			csvButton: main.getByRole("button", { name: "CSV" }),
			addToVodsButton: main.getByRole("link", { name: "Add to VoDs" }),
			addToVodsLoggedOutButton: main.getByRole("button", {
				name: "Add to VoDs",
			}),
			showDetailsButton: main.getByRole("button", { name: "Show details" }),
			notFound: main.getByText("This VoD is no longer saved."),
		};
	}

	/** The scanner with matching on the CPU, so a run never depends on the machine having a GPU. */
	async goto() {
		await this.page.addInitScript(
			([key]) => localStorage.setItem(key, JSON.stringify({ webgpu: false })),
			[SETTINGS_STORAGE_KEY],
		);
		await navigate({ page: this.page, url: SCANNER_PAGE });
	}

	async gotoVod(name: string) {
		await navigate({
			page: this.page,
			url: scannerSearchParams.href(SCANNER_PAGE, { view: "vod", name }),
		});
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	async chooseFile(filePath: string) {
		await this.locators.fileInput.setInputFiles(filePath);
	}

	/** A saved session or VoD in the landing's Sessions list. */
	sessionLink(name: string) {
		return this.page.getByRole("link", { name: new RegExp(name) });
	}

	/** The upload status button of a match card, named after its state (e.g. "Uploaded to sendou.ink"). */
	uploadStatusButton(state: string) {
		return this.locators.main.getByRole("button", { name: state });
	}

	async deleteScan() {
		await this.locators.deleteButton.click();
		await this.locators.confirmDeleteButton.click();
	}

	async downloadMatchesCsv() {
		await this.locators.csvButton.click();
		const downloadPromise = this.page.waitForEvent("download");
		await this.page.getByRole("menuitem", { name: "Matches" }).click();
		return downloadPromise;
	}
}

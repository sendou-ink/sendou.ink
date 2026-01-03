import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { SeedVariation } from "~/features/api-private/routes/seed";
import { tournamentBracketsPage } from "./urls";

const BASE_PORT = 6173;

type WorkerFixtures = {
	workerPort: number;
	workerBaseURL: string;
};

export const test = base.extend<object, WorkerFixtures>({
	workerPort: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
		async ({}, use, workerInfo) => {
			const port = BASE_PORT + workerInfo.parallelIndex;
			await use(port);
		},
		{ scope: "worker" },
	],
	workerBaseURL: [
		async ({ workerPort }, use) => {
			await use(`http://localhost:${workerPort}`);
		},
		{ scope: "worker" },
	],
	baseURL: async ({ workerBaseURL }, use) => {
		await use(workerBaseURL);
	},
});

export { expect };

export async function selectWeapon({
	page,
	name,
	testId = "weapon-select",
}: {
	page: Page;
	name: string;
	testId?: string;
}) {
	await page.getByTestId(testId).click();
	await page.getByPlaceholder("Search weapons...").fill(name);
	await page
		.getByRole("listbox", { name: "Suggestions" })
		.getByTestId(`weapon-select-option-${name}`)
		.click();
}

export async function selectStage({
	page,
	name,
	testId = "stage-select",
	nth,
}: {
	page: Page;
	name: string;
	testId?: string;
	nth?: number;
}) {
	const select =
		nth !== undefined
			? page.getByTestId(testId).nth(nth)
			: page.getByTestId(testId);
	await select.click();
	await page.getByPlaceholder("Search stages...").fill(name);
	await page.getByTestId(`stage-select-option-${name}`).click();
}

export async function selectUser({
	page,
	userName,
	labelName,
	exact = false,
}: {
	page: Page;
	userName: string;
	labelName: string;
	exact?: boolean;
}) {
	const comboboxButton = page.getByLabel(labelName, { exact });
	const searchInput = page.getByTestId("user-search-input");
	const option = page.getByTestId("user-search-item").first();

	await expect(comboboxButton).not.toBeDisabled();

	await comboboxButton.click();
	await searchInput.fill(userName);
	await expect(option).toBeVisible();
	await page.keyboard.press("Enter");
}

/** page.goto that waits for the page to be hydrated before proceeding */
export async function navigate({ page, url }: { page: Page; url: string }) {
	// Rewrite absolute URLs with localhost to use the worker's baseURL
	// This handles invite links and other URLs embedded with VITE_SITE_DOMAIN
	let targetUrl = url;
	if (url.startsWith("http://localhost:")) {
		const urlObj = new URL(url);
		// Extract just the path and search params, let Playwright use the correct baseURL
		targetUrl = urlObj.pathname + urlObj.search;
	}
	await page.goto(targetUrl);
	await expectIsHydrated(page);
}

/** Waits and expects the page to be hydrated (click handlers etc. ready for testing) */
export async function expectIsHydrated(page: Page) {
	await expect(page.getByTestId("hydrated")).toHaveCount(1);
}

export function seed(page: Page, variation?: SeedVariation) {
	return page.request.post("/seed", {
		form: { variation: variation ?? "DEFAULT" },
	});
}

export function impersonate(page: Page, userId = ADMIN_ID) {
	return page.request.post(`/auth/impersonate?id=${userId}`);
}

export async function submit(page: Page, testId?: string) {
	return waitForPOSTResponse(page, async () => {
		await page.getByTestId(testId ?? "submit-button").click();
	});
}

export async function waitForPOSTResponse(page: Page, cb: () => Promise<void>) {
	const responsePromise = page.waitForResponse(
		(res) => res.request().method() === "POST",
	);
	await cb();
	await responsePromise;
}

export function isNotVisible(locator: Locator) {
	return expect(locator).toHaveCount(0);
}

export function modalClickConfirmButton(page: Page) {
	return submit(page, "confirm-button");
}

export const startBracket = async (page: Page, tournamentId = 2) => {
	await seed(page);
	await impersonate(page);

	await navigate({
		page,
		url: tournamentBracketsPage({ tournamentId }),
	});

	await page.getByTestId("finalize-bracket-button").click();
	await submit(page, "confirm-finalize-bracket-button");
};

/** Sets a date using the `<SendouDatePicker />` component */
export async function setDateTime({
	page,
	date,
	label,
}: {
	page: Page;
	date: Date;
	label: string;
}) {
	const hours = date.getHours();

	await selectSpinbuttonValue({
		page,
		name: `year, ${label}`,
		value: date.getFullYear().toString(),
	});

	await selectSpinbuttonValue({
		page,
		name: `month, ${label}`,
		value: (date.getMonth() + 1).toString(),
	});

	await selectSpinbuttonValue({
		page,
		name: `day, ${label}`,
		value: date.getDate().toString(),
	});

	await selectSpinbuttonValue({
		page,
		name: `hour, ${label}`,
		value: String(hours % 12 || 12),
	});

	await selectSpinbuttonValue({
		page,
		name: `minute, ${label}`,
		value: date.getMinutes().toString().padStart(2, "0"),
	});

	await selectSpinbuttonValue({
		page,
		name: `AM/PM, ${label}`,
		value: hours >= 12 ? "PM" : "AM",
	});
}

async function selectSpinbuttonValue({
	page,
	name,
	value,
}: {
	page: Page;
	name: string;
	value: string;
}) {
	const locator = page.getByRole("spinbutton", {
		name,
		exact: true,
	});
	await locator.click();
	await locator.clear();
	await locator.fill(value);
}

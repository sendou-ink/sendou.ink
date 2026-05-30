import {
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import dotenv from "dotenv";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { SeedVariation } from "~/features/api-private/routes/seed";
import { tournamentBracketsPage } from "~/utils/urls";

dotenv.config();
export const E2E_BASE_PORT = Number(process.env.PORT || 5173) + 500;

type WorkerFixtures = {
	workerPort: number;
	workerBaseURL: string;
};

export const test = base.extend<object, WorkerFixtures>({
	workerPort: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
		async ({}, use, workerInfo) => {
			const port = E2E_BASE_PORT + workerInfo.parallelIndex;
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

export async function seed(page: Page, variation?: SeedVariation) {
	const MAX_ATTEMPTS = 3;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return await page.request.post("/seed", {
				form: { variation: variation ?? "DEFAULT", source: "e2e" },
				timeout: 7_500,
			});
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
		}
	}

	throw new Error("seed: unreachable");
}

export function impersonate(page: Page, userId = ADMIN_ID) {
	return page.request.post(`/auth/impersonate?id=${userId}`);
}

export async function submit(page: Page, testId?: string) {
	const postPromise = page.waitForResponse(
		(res) => res.request().method() === "POST",
	);
	await page.getByTestId(testId ?? "submit-button").click();
	const postRes = await postPromise;

	// Remix returns 202 from action endpoints when the action threw/returned a
	// redirect. The fetcher then drives a client-side navigation and, once
	// that completes, fires a partial revalidation GET against the route data.
	// If we return before that revalidation fires, a subsequent Link click can
	// be aborted mid-flight by the queued revalidation (ERR_ABORTED on the new
	// route's .data fetch), leaving the test on the old page.
	if (postRes.status() === 202) {
		await page.waitForResponse(
			(res) =>
				res.request().method() === "GET" &&
				res.url().includes(".data") &&
				!/__(?:success|error)=/.test(res.url()),
		);
	}
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

/**
 * Clicks a tournament nav tab by its testId, opening the overflow ("More") menu
 * first when the tab has collapsed into it on the current viewport.
 */
export async function clickNavTab(page: Page, testId: string) {
	const visibleTab = page.locator(`[data-testid="${testId}"]:visible`);
	if ((await visibleTab.count()) === 0) {
		await page.getByRole("button", { name: "More" }).click();
	}
	await visibleTab.click();
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

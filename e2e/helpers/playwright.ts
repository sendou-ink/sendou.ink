import {
	test as base,
	expect,
	type Locator,
	type Page,
	type Response,
} from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	assertFlushed,
	type Factories,
	flushIfDirty,
	loadFactories,
	resetForTest,
} from "./factories";

try {
	process.loadEnvFile();
} catch {
	// .env is optional; in CI env vars come from the host (e2e-tests.yml creates none)
}
export const E2E_BASE_PORT = Number(process.env.PORT || 5173) + 500;

export const MOBILE_VIEWPORT = { width: 375, height: 667 };
export const TABLET_VIEWPORT = { width: 768, height: 1024 };

/** Registered (>=1024) ports on the WHATWG fetch bad port list: Node's fetch
 * fails on them with "bad port" and Chromium with ERR_UNSAFE_PORT, so no worker
 * server may listen on one (e.g. base port 6673 would put worker 6 on 6679). */
const UNSAFE_PORTS = new Set([
	1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 5432, 5500, 5938, 6000,
	6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

/** The port of the given worker's server: base port + index, skipping unsafe ports. */
export function e2eWorkerPort(workerIndex: number) {
	let port = E2E_BASE_PORT - 1;
	for (let i = 0; i <= workerIndex; i++) {
		do {
			port++;
		} while (UNSAFE_PORTS.has(port));
	}
	return port;
}

/** The port a test can listen on to receive the given worker's Discord webhook calls. */
export function e2eWebhookPort(workerIndex: number) {
	return e2eWorkerPort(workerIndex) + 2000;
}

type WorkerFixtures = {
	workerPort: number;
	workerBaseURL: string;
	factories: Factories;
};

type TestFixtures = {
	resetDatabase: undefined;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
	context: async ({ context }, use) => {
		// Google Fonts load with display=swap and every test context re-fetches
		// them, so the swap reflows the page mid-test (e.g. re-collapsing the
		// tournament nav between a visibility check and a click). Block them so
		// layout settles at first paint and stays put.
		await context.route(
			/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
			(route) => route.abort(),
		);
		await use(context);
	},
	workerPort: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
		async ({}, use, workerInfo) => {
			const port = e2eWorkerPort(workerInfo.parallelIndex);
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
	factories: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring
		async ({}, use, workerInfo) => {
			await use(await loadFactories(workerInfo.parallelIndex));
		},
		{ scope: "worker" },
	],
	resetDatabase: [
		async ({ page, factories }, use) => {
			await resetForTest(page, factories);

			await use(undefined);

			// fails loudly instead of leaving the next test to guess
			await assertFlushed();
		},
		{ auto: true },
	],
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
	within,
}: {
	page: Page;
	userName: string;
	labelName: string;
	exact?: boolean;
	/** Scopes the combobox lookup, for pages carrying the label on more than one element. */
	within?: Locator;
}) {
	const comboboxButton = (within ?? page).getByLabel(labelName, { exact });
	const searchInput = page.getByTestId("user-search-input");
	const option = page.getByTestId("user-search-item").first();

	await expect(comboboxButton).not.toBeDisabled();

	await comboboxButton.click();
	await searchInput.fill(userName);
	await expect(option).toBeVisible();
	await page.keyboard.press("Enter");
}

export async function selectTournament({
	page,
	query,
}: {
	page: Page;
	query: string;
}) {
	const item = page.getByTestId("tournament-search-item");

	await page.getByRole("button", { name: /Tournament search/i }).click();
	await page.getByTestId("tournament-search-input").fill(query);
	await expect(item.first()).toBeVisible();
	await item.first().click();
}

/** page.goto that waits for the page to be hydrated before proceeding */
export async function navigate({ page, url }: { page: Page; url: string }) {
	await flushIfDirty(page);

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

export function impersonate(page: Page, userId = ADMIN_ID) {
	return retryPost(page, "impersonate", `/auth/impersonate?id=${userId}`);
}

/** Runs the named server Routine (normally cron-driven) in the worker's server process. */
export async function runRoutine(page: Page, name: string) {
	const response = await retryPost(page, "runRoutine", "/run-routine", {
		form: { name },
	});
	if (!response?.ok()) {
		throw new Error(
			`Running routine ${name} failed with status ${response?.status()}`,
		);
	}
}

/**
 * Direct (non-browser) POST that retries on transient network failures such as
 * "socket hang up", which the dev server can produce intermittently under load.
 * Only safe for idempotent endpoints.
 */
async function retryPost(
	page: Page,
	name: string,
	url: string,
	options?: Parameters<Page["request"]["post"]>[1],
) {
	await flushIfDirty(page);

	const MAX_ATTEMPTS = 3;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			return await page.request.post(url, { timeout: 7_500, ...options });
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
		}
	}

	throw new Error(`${name}: unreachable`);
}

export async function submit(page: Page, testId?: string) {
	await waitForPOSTResponse(page, async () => {
		await page.getByTestId(testId ?? "submit-button").click();
	});

	// Toast flash params are stripped right after via a replace navigation
	// (without revalidation); wait for it so it can't abort a later click.
	await expect(page).not.toHaveURL(/__(?:success|error)=/);
}

export async function waitForPOSTResponse(page: Page, cb: () => Promise<void>) {
	await flushIfDirty(page);

	const MAX_ATTEMPTS = 3;
	const PER_ATTEMPT_TIMEOUT = 10_000;

	// React Aria buttons fire their handler on press end. Occasionally a click
	// registers the press start (the button goes `:active`) but the press never
	// completes into a submit, so no POST fires — e.g. when a re-render lands
	// mid-press. Re-issue the action when the expected POST doesn't arrive
	// within the per-attempt window.
	let response: Response | undefined;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const responsePromise = page.waitForResponse(
			(res) => res.request().method() === "POST",
			{ timeout: PER_ATTEMPT_TIMEOUT },
		);
		await cb();
		try {
			response = await responsePromise;
			break;
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
		}
	}

	// The POST's revalidation (and any redirect it drives) is still in flight;
	// an interaction landing mid-flight aborts it, and routes that opt out of
	// revalidation on navigation (e.g. to.$id) then keep the stale data.
	await expectRouterIdle(page);

	return response!;
}

/** Waits until no navigation, revalidation or fetcher is in flight. */
async function expectRouterIdle(page: Page) {
	// A submit's redirect plus the target page's loaders can exceed the default
	// expect timeout when the full suite is loading all workers.
	await expect(page.getByTestId("hydrated")).toHaveAttribute(
		"data-router-idle",
		"true",
		{ timeout: 15_000 },
	);
}

/** Asserts the page rendered rather than the error boundary catching something. */
export async function expectNoErrorPage(page: Page) {
	await expect(page.getByTestId("error-page")).toHaveCount(0);
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

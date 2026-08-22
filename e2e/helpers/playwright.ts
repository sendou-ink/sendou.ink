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

interface RouterProbe {
	wentBusy: boolean;
	observer: MutationObserver;
}

declare global {
	interface Window {
		__routerProbe?: RouterProbe;
	}
}

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

/** Fills a React Aria datetime field's segments, targeting them by the field's label. */
export async function fillDateTimeField({
	scope,
	label,
	date,
}: {
	scope: Locator;
	label: string;
	date: Date;
}) {
	const fillSegment = (segment: string, value: string) =>
		scope
			.getByRole("spinbutton", { name: new RegExp(`^${segment}, ${label}`) })
			.fill(value);

	const hours = date.getHours();
	await fillSegment("year", String(date.getFullYear()));
	await fillSegment("month", String(date.getMonth() + 1));
	await fillSegment("day", String(date.getDate()));
	await fillSegment("hour", String(hours % 12 || 12));
	await fillSegment("minute", String(date.getMinutes()).padStart(2, "0"));
	await fillSegment("AM/PM", hours >= 12 ? "PM" : "AM");
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
	// domcontentloaded instead of the default load event: module scripts have
	// executed by then, and the hydration wait below covers the rest — no need
	// to also wait for images and other subresources
	await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
	await expectIsHydrated(page);
}

/** Waits and expects the page to be hydrated (click handlers etc. ready for testing) */
export async function expectIsHydrated(page: Page) {
	// waitFor reacts within a frame of the marker appearing, where the expect
	// poll would wait out its current back-off interval first
	await page
		.getByTestId("hydrated")
		.waitFor({ state: "attached", timeout: 5_000 });
}

export function impersonate(page: Page, userId = ADMIN_ID) {
	return retryPost(page, "impersonate", `/auth/impersonate?id=${userId}`);
}

/**
 * Makes the worker's server resolve every season as over, so tests can cover the
 * season boundary. Undone before the next test starts.
 */
export async function endSeason(page: Page) {
	const response = await retryPost(page, "endSeason", "/end-season");
	if (!response?.ok()) {
		throw new Error(
			`Ending the season failed with status ${response?.status()}`,
		);
	}
}

/**
 * Makes the worker's server resolve Plus Server voting as active, so tests can
 * cover the voting window. Undone before the next test starts.
 */
export async function setPlusVotingActive(page: Page, active: boolean) {
	const response = await retryPost(
		page,
		"setPlusVotingActive",
		"/set-plus-voting-active",
		{ form: { active: String(active) } },
	);
	if (!response?.ok()) {
		throw new Error(
			`Setting plus voting active failed with status ${response?.status()}`,
		);
	}
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
			// maxRedirects 0: impersonate answers with a redirect to the admin
			// page, and following it would server-render a page nobody reads —
			// the Set-Cookie lands in the context jar either way
			return await page.request.post(url, {
				timeout: 7_500,
				maxRedirects: 0,
				...options,
			});
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
		}
	}

	throw new Error(`${name}: unreachable`);
}

/** Clicks a submit button and waits for the POST it fires. Takes a locator when
 * the test id alone is ambiguous, e.g. one button per card on a list page. */
export async function submit(page: Page, target?: string | Locator) {
	const button =
		typeof target === "object"
			? target
			: page.getByTestId(target ?? "submit-button");

	await waitForPOSTResponse(page, async () => {
		await button.click();
	});

	// An action's toast redirect adds flash params that a replace navigation
	// strips right after (without revalidation), remounting every form on the
	// page twice. Waiting on the rendered search rather than the browser's URL
	// covers the commit those remounts land in, which trails the history entry
	// — otherwise the second remount tears down whatever the test opens next.
	await page.waitForSelector(
		'[data-testid="hydrated"]:not([data-location-search*="__success"]):not([data-location-search*="__error"])',
		{ state: "attached", timeout: 5_000 },
	);
}

export async function waitForPOSTResponse(page: Page, cb: () => Promise<void>) {
	await flushIfDirty(page);

	const MAX_ATTEMPTS = 3;
	const PER_ATTEMPT_TIMEOUT = 10_000;

	await armRouterProbe(page);

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

	// React commits the submission before the POST leaves the browser, but on a
	// loaded machine it can lag behind the response; without waiting for it the
	// idle of the *previous* render reads as the action having settled.
	if (!(await routerWentBusy(page))) {
		await page
			.waitForFunction(
				() => window.__routerProbe?.wentBusy !== false,
				undefined,
				{
					timeout: 2_000,
					polling: 50,
				},
			)
			// a POST that no fetcher or navigation drives never turns the router busy
			.catch(() => {});
	}

	// The POST's revalidation (and any redirect it drives) is still in flight;
	// an interaction landing mid-flight aborts it, and routes that opt out of
	// revalidation on navigation (e.g. to.$id) then keep the stale data.
	await expectRouterIdle(page);

	return response!;
}

/**
 * Starts recording whether the router turns busy. A fast action holds the busy
 * marker for a frame or two, which a polled wait misses outright; the flag a
 * `MutationObserver` sets survives the marker flipping back.
 */
async function armRouterProbe(page: Page) {
	await page.evaluate(() => {
		window.__routerProbe?.observer.disconnect();

		const marker = document.querySelector('[data-testid="hydrated"]');
		if (!marker) return;

		const probe: RouterProbe = {
			wentBusy: false,
			observer: new MutationObserver(() => {
				if (marker.getAttribute("data-router-idle") !== "true") {
					probe.wentBusy = true;
				}
			}),
		};
		probe.observer.observe(marker, {
			attributes: true,
			attributeFilter: ["data-router-idle"],
		});

		window.__routerProbe = probe;
	});
}

/** A missing probe means a document navigation wiped it, which only a busy router does. */
function routerWentBusy(page: Page) {
	return page.evaluate(() => window.__routerProbe?.wentBusy !== false);
}

/** Waits until no navigation, revalidation or fetcher is in flight. */
async function expectRouterIdle(page: Page) {
	// A submit's redirect plus the target page's loaders can exceed the default
	// expect timeout when the full suite is loading all workers.
	try {
		await page.waitForSelector(
			'[data-testid="hydrated"][data-router-idle="true"]',
			{ state: "attached", timeout: 15_000 },
		);
	} catch (error) {
		// data-router-busy names what is still in flight, which the attribute
		// assertion's own message does not
		const busy = await page
			.getByTestId("hydrated")
			.getAttribute("data-router-busy")
			.catch(() => null);

		throw new Error(
			`Router never went idle at ${page.url()} (in flight: ${busy ?? "unknown"})`,
			{ cause: error },
		);
	}
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

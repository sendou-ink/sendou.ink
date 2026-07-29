import {
	test as base,
	expect,
	type Locator,
	type Page,
	type Response,
} from "@playwright/test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { tournamentBracketsPage } from "~/utils/urls";
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

type WorkerFixtures = {
	workerPort: number;
	workerBaseURL: string;
	factories: Factories;
};

type TestFixtures = {
	resetDatabase: undefined;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
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
	// Started before the click because the data GET can land before awaiting the
	// POST response hands control back to us, and `page.waitForResponse` only
	// sees responses arriving after it is called.
	const dataGet = watchForDataGetAfterPOST(page);

	try {
		const postRes = await waitForPOSTResponse(page, async () => {
			await page.getByTestId(testId ?? "submit-button").click();
		});

		// Remix returns 202 from action endpoints when the action threw/returned a
		// redirect. The fetcher then drives a client-side navigation and, once
		// that completes, fires a GET against the new route's data. If we return
		// before that GET fires, a subsequent Link click can be aborted mid-flight
		// by the queued navigation (ERR_ABORTED on the new route's .data fetch),
		// leaving the test on the old page.
		if (postRes.status() !== 202) return;

		await dataGet.fired;
		// Toast flash params are stripped right after via a replace navigation
		// (without revalidation); wait for it so it can't abort a later click.
		await expect(page).not.toHaveURL(/__(?:success|error)=/);
	} finally {
		dataGet.stop();
	}
}

/**
 * Resolves once a route data GET follows the POST, without missing one that
 * arrives while the caller is still awaiting the POST response.
 */
function watchForDataGetAfterPOST(page: Page) {
	const TIMEOUT = 15_000;

	let postSeen = false;
	let resolveFired: () => void = () => {};
	let rejectFired: (error: Error) => void = () => {};

	const fired = new Promise<void>((resolve, reject) => {
		resolveFired = resolve;
		rejectFired = reject;
	});

	const onResponse = (res: Response) => {
		if (!postSeen) {
			postSeen = res.request().method() === "POST";
			return;
		}

		if (res.request().method() === "GET" && res.url().includes(".data")) {
			resolveFired();
		}
	};
	page.on("response", onResponse);

	const timeout = setTimeout(
		() =>
			rejectFired(
				new Error(
					`submit: no route data GET followed the redirecting POST within ${TIMEOUT}ms`,
				),
			),
		TIMEOUT,
	);

	return {
		fired,
		stop: () => {
			clearTimeout(timeout);
			page.off("response", onResponse);
			// Nothing awaits `fired` when the POST wasn't a redirect
			resolveFired();
		},
	};
}

export async function waitForPOSTResponse(page: Page, cb: () => Promise<void>) {
	await flushIfDirty(page);

	const MAX_ATTEMPTS = 3;
	const PER_ATTEMPT_TIMEOUT = 10_000;

	// React Aria buttons fire their handler on press end. Occasionally a click
	// registers the press start (the button goes `:active`) but the press never
	// completes into a submit, so no POST fires. The match page revalidating on
	// a websocket message mid-click is one way this happens. Re-issue the action
	// when the expected POST doesn't arrive within the per-attempt window.
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const responsePromise = page.waitForResponse(
			(res) => res.request().method() === "POST",
			{ timeout: PER_ATTEMPT_TIMEOUT },
		);
		await cb();
		try {
			return await responsePromise;
		} catch (error) {
			if (attempt === MAX_ATTEMPTS) throw error;
		}
	}

	throw new Error("waitForPOSTResponse: unreachable");
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

// xxx: should be removed
export const startBracket = async (page: Page, tournamentId = 2) => {
	await impersonate(page);

	await navigate({
		page,
		url: tournamentBracketsPage({ tournamentId }),
	});

	await page.getByTestId("finalize-bracket-button").click();
	await submit(page, "confirm-finalize-bracket-button");
};

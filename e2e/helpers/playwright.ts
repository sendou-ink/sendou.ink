import {
	type BrowserContext,
	test as base,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";
import { format } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	assertFlushed,
	type Factories,
	flushIfDirty,
	loadFactories,
	resetForTest,
} from "./factories";
import { postRetryingTransientFailures } from "./request";

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
		__scrollYAtPress?: number;
	}
}

/** `YT.Player` that never readies, so a VoD form behaves as it does before the real one loads. Present from the start, the real API is never fetched. */
const YOUTUBE_IFRAME_API_STUB = `
window.YT = {
	Player: class {
		getCurrentTime() { return 0; }
		destroy() {}
	},
};
`;

/** Minified React errors for a hydration mismatch (418, 425) or a boundary hydration gave up on (421, 422, 423). */
const HYDRATION_ERROR_REGEX = /Minified React error #(418|421|422|423|425)\b/;

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
	context: async ({ context }, use, testInfo) => {
		// The VoD pages embed a YouTube player, which loads from the internet
		// (player, ads, telemetry) at a pace of its own. Under load it landed
		// mid-test, and the frame arriving closed the select being filled in.
		// A stub player API keeps the pages off the network. An init script and
		// not a route: any route turns off the browser's HTTP cache for the whole
		// context, and every navigation then refetches all ~200 script chunks.
		// The hosts themselves are cut off in playwright.config.ts.
		await context.addInitScript(YOUTUBE_IFRAME_API_STUB);

		const hydrationErrors: string[] = [];
		context.on("weberror", (webError) => {
			const message = webError.error().message;
			if (HYDRATION_ERROR_REGEX.test(message)) hydrationErrors.push(message);
		});

		const visitedPathnames = trackVisitedPathnames(context);
		const apiExchanges = recordApiExchanges(context);
		if (process.env.LIVING_DOCS_CAPTURE) livingDocsContext = context;

		await use(context);

		livingDocsContext = null;

		if (visitedPathnames) {
			await testInfo.attach(LIVING_DOCS_VISITS_ATTACHMENT, {
				body: JSON.stringify([...visitedPathnames]),
				contentType: "application/json",
			});
		}
		if (apiExchanges && apiExchanges.length > 0) {
			await testInfo.attach(LIVING_DOCS_API_ATTACHMENT, {
				body: JSON.stringify(apiExchanges),
				contentType: "application/json",
			});
		}

		// React recovers from these silently by rendering the boundary again on the client
		expect(hydrationErrors, "React hydration errors").toEqual([]);
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

if (process.env.LIVING_DOCS_CAPTURE) screenshotEachStep();

export { expect };

/** Name of the test attachment listing the pathnames a test visited, read by `scripts/living-docs/capture.ts`. */
const LIVING_DOCS_VISITS_ATTACHMENT = "living-docs-visits";
/** Name prefix of the screenshot attached after each `test.step`, read by `scripts/living-docs/capture.ts`. */
const LIVING_DOCS_STEP_ATTACHMENT = "living-docs-step";
/** Name of the test attachment listing the `/api/` requests a test made through `page.request`, read by `scripts/living-docs/capture.ts`. */
const LIVING_DOCS_API_ATTACHMENT = "living-docs-api";

/** Context of the running test, only while capturing for the living docs. */
let livingDocsContext: BrowserContext | null = null;

/** Attaches a screenshot of the page as each `test.step` leaves it, the trace's screencast lags too far behind for it. */
function screenshotEachStep() {
	const step = test.step;
	const withScreenshot = async <T>(
		...[title, body, options]: Parameters<typeof step<T>>
	) => {
		const result = await step(title, body, options);

		const page = livingDocsContext?.pages().at(-1);
		if (page) {
			await test.info().attach(`${LIVING_DOCS_STEP_ATTACHMENT}: ${title}`, {
				body: await page.screenshot({
					type: "jpeg",
					quality: 80,
					animations: "disabled",
				}),
				contentType: "image/jpeg",
			});
		}

		return result;
	};

	test.step = Object.assign(withScreenshot, step);
}

/** Pathnames every page of the context navigates to, only while capturing for the living docs. */
function trackVisitedPathnames(context: BrowserContext) {
	if (!process.env.LIVING_DOCS_CAPTURE) return null;

	const pathnames = new Set<string>();
	const track = (page: Page) => {
		page.on("framenavigated", (frame) => {
			if (frame !== page.mainFrame()) return;
			const url = new URL(frame.url());
			if (url.protocol.startsWith("http")) pathnames.add(url.pathname);
		});
	};
	for (const page of context.pages()) track(page);
	context.on("page", track);

	return pathnames;
}

/** The `/api/` requests made through the context's `request` (what `page.request` is), only while capturing for the living docs. */
function recordApiExchanges(context: BrowserContext) {
	if (!process.env.LIVING_DOCS_CAPTURE) return null;

	const exchanges: Array<{
		method: string;
		path: string;
		status: number;
		requestBody: unknown;
		responseBody: unknown;
	}> = [];
	const request = context.request;
	const fetch = request.fetch.bind(request);

	request.fetch = async (urlOrRequest, options) => {
		const response = await fetch(urlOrRequest, options);

		const url = new URL(response.url());
		if (url.pathname.startsWith("/api/")) {
			const isJson = response.headers()["content-type"]?.includes("json");
			const body = await response.text();
			exchanges.push({
				method: options?.method?.toUpperCase() ?? "GET",
				path: `${url.pathname}${url.search}`,
				status: response.status(),
				requestBody: options?.data ?? null,
				responseBody: isJson && body ? JSON.parse(body) : null,
			});
		}

		return response;
	};

	return exchanges;
}

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
		.getByRole("listbox")
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
	await page
		.getByRole("listbox")
		.getByTestId(`stage-select-option-${name}`)
		.click();
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
	const option = page
		.getByRole("listbox")
		.getByTestId("user-search-item")
		.first();

	await expect(comboboxButton).not.toBeDisabled();

	await comboboxButton.click();
	await searchInput.fill(userName);
	// clicking rather than pressing Enter: a result is in the DOM one commit
	// before the effect that registers it and focuses it for Enter has run
	await option.click();
}

export async function selectTournament({
	page,
	query,
}: {
	page: Page;
	query: string;
}) {
	const item = page.getByRole("listbox").getByTestId("tournament-search-item");

	await page.getByRole("button", { name: /Tournament search/i }).click();
	await page.getByTestId("tournament-search-input").fill(query);
	await expect(item.first()).toBeVisible();
	await item.first().click();
}

/** The value a native `datetime-local` input takes for a local `Date`. */
export function datetimeLocalValue(date: Date) {
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** The value a native `date` input takes for a local `Date`. */
export function dateInputValue(date: Date) {
	return format(date, "yyyy-MM-dd");
}

/** Fills a native datetime field, targeting it by its label. */
export async function fillDateTimeField({
	scope,
	label,
	date,
}: {
	scope: Locator;
	label: string;
	date: Date;
}) {
	await scope
		.getByLabel(new RegExp(`^${label} *\\*?$`))
		.fill(datetimeLocalValue(date));
}

/** page.goto that waits for the page to be hydrated before proceeding */
export async function navigate({ page, url }: { page: Page; url: string }) {
	await flushIfDirty(page);

	// invite links and other URLs embed VITE_SITE_DOMAIN; strip it so Playwright applies the worker's baseURL
	let targetUrl = url;
	if (url.startsWith("http://localhost:")) {
		const urlObj = new URL(url);
		targetUrl = urlObj.pathname + urlObj.search;
	}
	// domcontentloaded: module scripts have run by then and the hydration wait covers the rest
	await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
	if (await scriptsRan(page)) {
		await expectIsHydrated(page);
	}
}

/** Whether the page's scripts execute, which a `javaScriptEnabled: false` test has turned off. */
function scriptsRan(page: Page) {
	return page.evaluate(() => "__reactRouterContext" in window);
}

/**
 * Holds back the page's scripts so that the server rendered DOM can be interacted
 * with the way a user beating hydration to it does. The returned function lets
 * them through, after which the page hydrates as usual.
 */
export async function holdScripts(page: Page) {
	const waiting: Array<() => void> = [];
	let holding = true;

	await page.route(/\/assets\/.*\.js/, async (route) => {
		if (holding) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		await route.continue();
	});

	return () => {
		holding = false;
		for (const release of waiting) release();
	};
}

/** Waits and expects the page to be hydrated (click handlers etc. ready for testing) */
export async function expectIsHydrated(page: Page) {
	// waitFor reacts within a frame of the marker appearing, where the expect
	// poll would wait out its current back-off interval first. A context's first
	// load fetches ~200 script chunks, which took 7s with the suite loading
	// every core (the scanner's video pipeline especially)
	try {
		await page
			.getByTestId("hydrated")
			.waitFor({ state: "attached", timeout: 15_000 });
	} catch (error) {
		const loadReport = await hydrationLoadReport(page).catch(() => null);
		throw new Error(
			`Page never hydrated at ${page.url()}\n${loadReport ?? "(no load report)"}`,
			{ cause: error },
		);
	}
}

/** What the page loaded and how long it took, for telling a slow request from a slow main thread. */
function hydrationLoadReport(page: Page) {
	return page.evaluate(async () => {
		const longTasks = await new Promise<PerformanceEntryList>((resolve) => {
			new PerformanceObserver((list, observer) => {
				observer.disconnect();
				resolve(list.getEntries());
			}).observe({ type: "longtask", buffered: true });
			setTimeout(() => resolve([]), 100);
		});
		const resources = performance.getEntriesByType(
			"resource",
		) as PerformanceResourceTiming[];
		const loadedUrls = new Set(resources.map((resource) => resource.name));
		const scriptUrls = [
			...document.querySelectorAll<HTMLLinkElement>("link[rel=modulepreload]"),
		].map((link) => link.href);
		const pendingScripts = scriptUrls.filter((url) => !loadedUrls.has(url));
		const slowest = resources
			.toSorted((a, b) => b.duration - a.duration)
			.slice(0, 5)
			.map(
				(resource) =>
					`  ${new URL(resource.name).pathname} started ${Math.round(resource.startTime)}ms, took ${Math.round(resource.duration)}ms`,
			);

		return [
			`document ${document.readyState} ${Math.round(performance.now())}ms after navigation start, ${resources.length} resources loaded`,
			`long tasks: ${longTasks.length}, ${Math.round(longTasks.reduce((sum, task) => sum + task.duration, 0))}ms in total, longest ${Math.round(Math.max(0, ...longTasks.map((task) => task.duration)))}ms`,
			`modulepreloads not loaded: ${pendingScripts.length}/${scriptUrls.length}`,
			...pendingScripts.slice(0, 5).map((url) => `  ${new URL(url).pathname}`),
			"slowest resources:",
			...slowest,
		].join("\n");
	});
}

export function impersonate(page: Page, userId = ADMIN_ID) {
	return retryPost(page, `/auth/impersonate?id=${userId}`);
}

/** Makes the worker's server resolve every season as over. Undone before the next test starts. */
export async function endSeason(page: Page) {
	const response = await retryPost(page, "/end-season");
	if (!response?.ok()) {
		throw new Error(
			`Ending the season failed with status ${response?.status()}`,
		);
	}
}

/** Makes the worker's server resolve Plus Server voting as active. Undone before the next test starts. */
export async function setPlusVotingActive(page: Page, active: boolean) {
	const response = await retryPost(page, "/set-plus-voting-active", {
		form: { active: String(active) },
	});
	if (!response?.ok()) {
		throw new Error(
			`Setting plus voting active failed with status ${response?.status()}`,
		);
	}
}

/** Runs the named server Routine (normally cron-driven) in the worker's server process. */
export async function runRoutine(page: Page, name: string) {
	const response = await retryPost(page, "/run-routine", {
		form: { name },
	});
	if (!response?.ok()) {
		throw new Error(
			`Running routine ${name} failed with status ${response?.status()}`,
		);
	}
}

/** {@link postRetryingTransientFailures} after telling the server about the test's factory writes. */
async function retryPost(
	page: Page,
	url: string,
	options?: Parameters<Page["request"]["post"]>[1],
) {
	await flushIfDirty(page);

	// maxRedirects 0: following impersonate's redirect would render a page nobody reads;
	// the Set-Cookie lands in the context jar either way
	return postRetryingTransientFailures(page, url, {
		maxRedirects: 0,
		...options,
	});
}

/** Clicks a submit button and waits for the POST it fires. Takes a locator when
 * the test id alone is ambiguous, e.g. one button per card on a list page.
 * Buttons inside closed dialogs (rendered but hidden) are skipped. */
export async function submit(page: Page, target?: string | Locator) {
	const button =
		typeof target === "object"
			? target
			: page.getByTestId(target ?? "submit-button").filter({ visible: true });

	await waitForPOSTResponse(page, async () => {
		await button.click();
	});

	// An action's toast redirect adds flash params that a replace navigation
	// strips right after (without revalidation), remounting every form on the
	// page twice. Waiting on the rendered search rather than the browser's URL
	// covers the commit those remounts land in, which trails the history entry
	// — otherwise the second remount tears down whatever the test opens next.
	await page
		.locator(
			'[data-testid="hydrated"]:not([data-location-search*="__success"]):not([data-location-search*="__error"])',
		)
		.waitFor({ state: "attached", timeout: 5_000 });
}

export async function waitForPOSTResponse(page: Page, cb: () => Promise<void>) {
	await flushIfDirty(page);

	// A submission aborts in-flight fetcher loads (e.g. UserSearch's initial user) to rerun them
	// later, but if the action redirects off their route React Router never does and they stay
	// "loading" forever. The probe below also can't see an already busy router turn busy.
	await expectRouterIdle(page);

	await armRouterProbe(page);

	const responsePromise = page.waitForResponse(
		(res) => res.request().method() === "POST" && isDataRequest(res.url()),
		{ timeout: 10_000 },
	);
	await cb();
	const response = await responsePromise;

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

	return response;
}

function isDataRequest(url: string) {
	return new URL(url).pathname.endsWith(".data");
}

/** Records whether the router turns busy: a fast action holds the marker for a frame or two, which a polled wait misses. */
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

/**
 * Waits for the app to have rendered the page the browser is on. The browser's URL changes a
 * commit before the app's, and what the layout does on navigation (e.g. closing its popovers)
 * runs only after that, so it would undo e.g. a popover opened in between.
 */
export async function waitForNavigationRendered(page: Page) {
	await page.waitForFunction(
		() => {
			const marker = document.querySelector('[data-testid="hydrated"]');
			return (
				marker?.getAttribute("data-router-idle") === "true" &&
				marker.getAttribute("data-location-pathname") ===
					window.location.pathname
			);
		},
		undefined,
		{ polling: 50, timeout: 15_000 },
	);
}

/** Waits until no navigation, revalidation or fetcher is in flight. */
async function expectRouterIdle(page: Page) {
	// A submit's redirect plus the target page's loaders can exceed the default
	// expect timeout when the full suite is loading all workers.
	try {
		await page
			.locator('[data-testid="hydrated"][data-router-idle="true"]')
			.waitFor({ state: "attached", timeout: 15_000 });
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

/** dnd-kit stops every click in the document for this long after a drop (`PointerSensor.detach`). */
const DND_KIT_CLICK_SUPPRESSION_MS = 50;

/** Waits out dnd-kit's post-drop click suppression, which nothing observable marks the end of. Call after the `mouse.up()` of a drag. */
export async function waitForDropToSettle(page: Page) {
	// biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: the suppression window has no observable end
	await page.waitForTimeout(2 * DND_KIT_CLICK_SUPPRESSION_MS);
}

/**
 * Drags `from` onto `to` with a dnd-kit compatible stepped pointer move, then waits for the drop to settle.
 * Dropped at the center of `to` unless `at` gives the spot, relative to its top left corner.
 */
export async function dragAndDrop(
	page: Page,
	{
		from,
		to,
		at,
	}: {
		from: Locator;
		to: Locator;
		at?: (box: { width: number; height: number }) => { x: number; y: number };
	},
) {
	await from.hover();
	await page.mouse.down();

	const targetBox = await to.boundingBox();
	if (!targetBox) {
		throw new Error("The drop target has no bounding box");
	}
	const dropAt = at
		? at(targetBox)
		: { x: targetBox.width / 2, y: targetBox.height / 2 };
	// the drag & drop library only registers the drop when moved in steps
	await page.mouse.move(targetBox.x + dropAt.x, targetBox.y + dropAt.y, {
		steps: 10,
	});
	await page.mouse.up();

	await waitForDropToSettle(page);
}

/**
 * The scroll position the page was at when it was last pressed, for asserting that
 * an action did not move the viewer. Playwright scrolls a click target into view
 * itself, and a retried click force-scrolls it again, so a reading taken before the
 * press can be stale by the time the press lands.
 */
export async function trackScrollYAtPress(page: Page) {
	await page.evaluate(() => {
		window.__scrollYAtPress = undefined;
		document.addEventListener(
			"pointerdown",
			() => {
				window.__scrollYAtPress = window.scrollY;
			},
			{ capture: true },
		);
	});

	return async () => {
		const scrollY = await page.evaluate(() => window.__scrollYAtPress);
		if (typeof scrollY !== "number") {
			throw new Error("The page was never pressed");
		}

		return scrollY;
	};
}

/** Asserts the page rendered rather than the error boundary catching something. */
export async function expectNoErrorPage(page: Page) {
	await expect(page.getByTestId("error-page")).toHaveCount(0);
}

/** The loader data of every route rendered on the page, as JSON, e.g. to assert a secret never reaches the client. */
export function loaderDataJson(page: Page): Promise<string> {
	return page.evaluate(() =>
		JSON.stringify(
			(
				window as unknown as {
					__reactRouterDataRouter: { state: { loaderData: unknown } };
				}
			).__reactRouterDataRouter.state.loaderData,
		),
	);
}

export function isNotVisible(locator: Locator) {
	return expect(locator).toHaveCount(0);
}

export function modalClickConfirmButton(page: Page) {
	return submit(page, "confirm-button");
}

/** Clicks a tournament nav tab by testId, via the overflow ("More") menu when it has collapsed into it. */
export async function clickNavTab(page: Page, testId: string) {
	const visibleTab = page.locator(`[data-testid="${testId}"]:visible`);
	if ((await visibleTab.count()) === 0) {
		await page.getByRole("button", { name: "More" }).click();
	}
	await visibleTab.click();
}

/** The IANA timezone of the machine running the tests, the one fixture times should be computed in. */
export const MACHINE_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Pre-writes the timezone cookie so the first document request already renders in the machine's timezone. */
export function setTimezoneCookie(page: Page) {
	return page.context().addCookies([
		{
			name: "timezone",
			value: MACHINE_TIMEZONE,
			domain: "localhost",
			path: "/",
		},
	]);
}

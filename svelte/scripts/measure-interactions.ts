// What happens after load, React vs Svelte: interaction cost, input latency, hydration, soft navigation and
// memory of the pages below, both as production builds in Chromium with a throttled CPU. Run by measure.ts.
import type { Browser, CDPSession, Page } from "@playwright/test";

/** The stand-in shells of both apps set this mark once the page has hydrated. */
export const HYDRATED_MARK = "sendou:hydrated";

const DEFAULT_INTERACTION_RUNS = 7;
/** The first run warms up the machine and the servers. */
const DISCARDED_RUNS = 1;
/** Between two interactions, so each gets frames of its own as when a person types or clicks. */
const INTERACTION_GAP_MS = 80;
/** Tall enough that the pages measured fit without scrolling: clicks land on recorded coordinates. */
const VIEWPORT = { width: 1280, height: 3000 };
const SOFT_NAVIGATION_ROUND_TRIPS = 20;
const SOFT_NAVIGATION_TIMEOUT_MS = 15_000;
/** The fourth load of a page in one browser context runs from V8's code cache. */
const WARM_LOAD_INDEX = 3;
/** Discrete input events, the ones an interaction starts with; inserted text (an IME, a paste) fires only the input ones. */
const INTERACTION_EVENT_TYPES = new Set([
	"beforeinput",
	"input",
	"keydown",
	"keypress",
	"keyup",
	"pointerdown",
	"pointerup",
	"mousedown",
	"mouseup",
	"click",
]);
/** Input events of one interaction follow each other closely, interactions are INTERACTION_GAP_MS apart. */
const INTERACTION_CLUSTER_GAP_MS = 40;

const LIGHT_PAGE = {
	path: "/associations",
	readySelector: "main h1.text-xl",
};

type Step = { click: string } | { press: string } | { insertText: string };

interface Scenario {
	description: string;
	/** Run once before the warm-up cycles, e.g. to focus a field. */
	setup?: Step[];
	/** Repeated; every step is one interaction. Must leave the page as it found it. */
	cycle: Step[];
	repetitions: number;
	/** Throws if the cycles did not leave the page in the state they started from. */
	assertEndState?: (page: Page) => Promise<void>;
}

export interface MeasuredPage {
	path: string;
	/** Present once the page's content has rendered. */
	readySelector: string;
	scenarios: Record<string, Scenario>;
	revalidation?: Revalidation;
}

/** The page's data revalidated, each time with one value changed on the server first. */
export interface Revalidation {
	description: string;
	updates: number;
	/** Makes the server's data differ for update `index` (warm-ups included), e.g. a score written to the database. */
	changeOnServer: (index: number) => void;
	/** Puts the server's data back as it was before the first change. */
	restore: () => void;
	/** Holds `expectedText(index)` once update `index` has rendered. */
	selector: string;
	expectedText: (index: number) => string;
}

const CALENDAR_NAME_INPUT = 'main input[type="text"] >> nth=0';
const CALENDAR_BRACKET_URL_INPUT = 'main input[type="text"] >> nth=1';

export const CALENDAR_NEW_PAGE: MeasuredPage = {
	path: "/calendar/new",
	readySelector: '[data-testid="date-add-item-button"]',
	scenarios: {
		typeName: {
			description:
				"100 keystrokes into the name field (typing 10 letters, erasing them): a plain <input> on both sides, the cleanest framework comparison",
			setup: [{ click: CALENDAR_NAME_INPUT }],
			cycle: [
				..."abcdefghij".split("").map((key) => ({ press: key })),
				...Array.from({ length: 10 }, () => ({ press: "Backspace" })),
			],
			repetitions: 5,
			assertEndState: async (page) =>
				expectValue(page, CALENDAR_NAME_INPUT, ""),
		},
		addRemoveDate: {
			description:
				"20 cycles of adding a row to the dates array field and removing it",
			cycle: [
				{ click: '[data-testid="date-add-item-button"]' },
				{ click: '[data-testid="date-remove-item-button"] >> nth=1' },
			],
			repetitions: 20,
			assertEndState: async (page) =>
				expectCount(page, 'main input[type="datetime-local"]', 1),
		},
		switchMapPoolTab: {
			description:
				"40 switches between two mode tabs of the map pool picker, each unmounting one panel of 25 stage checkboxes and mounting another",
			cycle: [
				{ click: 'main [role="tab"] >> nth=0' },
				{ click: 'main [role="tab"] >> nth=1' },
			],
			repetitions: 20,
			assertEndState: async (page) =>
				expectCount(page, 'main [role="tabpanel"] input[type="checkbox"]', 25),
		},
		validationErrors: {
			description:
				"10 cycles of submitting with the name and bracket URL empty (the name's error shown and focused), filling the name (its error cleared, the bracket URL's shown: that cross-field rule runs once the fields pass), filling the bracket URL (no errors) and emptying both again (errors back). After a submit every change revalidates the whole form",
			cycle: [
				{ click: '[data-testid="submit-button"]' },
				{ insertText: "Weekly cup" },
				{ click: CALENDAR_BRACKET_URL_INPUT },
				{ insertText: "https://example.com" },
				{ press: "ControlOrMeta+A" },
				{ press: "Backspace" },
				{ click: CALENDAR_NAME_INPUT },
				{ press: "ControlOrMeta+A" },
				{ press: "Backspace" },
			],
			repetitions: 10,
			assertEndState: async (page) => {
				await expectValue(page, CALENDAR_NAME_INPUT, "");
				await expectCount(page, 'main [aria-invalid="true"]', 1);
			},
		},
	},
};

/** A tournament's bracket page, whose revalidation updates the score of one match. */
export function tournamentBracketPage({
	tournamentId,
	bracketIdx,
	revalidation,
}: {
	tournamentId: number;
	bracketIdx: number;
	revalidation: Revalidation;
}): MeasuredPage {
	return {
		path: `/to/${tournamentId}/brackets?idx=${bracketIdx}`,
		readySelector: '[data-testid="brackets-viewer"] [data-testid="match-wrapper"]',
		scenarios: {
			toggleCompactify: {
				description:
					"40 toggles of Compactify, hiding and showing again the rounds without ongoing matches: a client-side change to a big part of the bracket",
				cycle: [
					{ click: 'main button:has-text("Compactify")' },
					{ click: 'main button:has-text("Show all")' },
				],
				repetitions: 20,
				assertEndState: async (page) =>
					expectCount(page, 'main button:has-text("Compactify")', 1),
			},
		},
		revalidation,
	};
}

type AppName = "react" | "svelte";

interface InteractionContext {
	browser: Browser;
	origins: Record<AppName, string>;
	/** Servers without their in-process caches (DISABLE_CACHE), so data written to the database shows on the next revalidation. */
	uncachedOrigins: Record<AppName, string>;
	sessionCookie: string;
	cpuThrottleRate: number;
	/** Called between runs so the caller can track the machine's load. */
	sampleLoad: () => void;
	/** Including the discarded first one; fewer than the default only for a quick check of the harness. */
	runs?: number;
	/** Measures only this one scenario (`page.scenario`, e.g. `calendarNew.typeName`), to redo it after a disturbed run. */
	onlyScenario?: string;
}

/** Every page's scenarios, hydration, soft navigation and memory, the apps interleaved within each run. */
export async function interactionMeasurements(
	context: InteractionContext,
	pages: Record<string, MeasuredPage>,
) {
	const samples: Samples = {};
	const record = (key: string[], value: number) => {
		const path = key.join(".");
		(samples[path] ??= []).push(value);
	};
	const latencies: Record<string, number[]> = {};
	const domNodes: Record<string, Record<AppName, DomNodes>> = {};
	const runs = context.runs ?? DEFAULT_INTERACTION_RUNS;

	for (let run = 0; run < runs; run++) {
		const isMeasured = run >= DISCARDED_RUNS;
		const order: AppName[] =
			run % 2 === 0 ? ["react", "svelte"] : ["svelte", "react"];
		console.error(
			`interactions: run ${run + 1}/${runs}${isMeasured ? "" : " (discarded)"}`,
		);

		for (const [pageName, page] of Object.entries(pages)) {
			for (const [scenarioName, scenario] of Object.entries(page.scenarios)) {
				if (
					context.onlyScenario &&
					context.onlyScenario !== `${pageName}.${scenarioName}`
				) {
					continue;
				}
				for (const app of order) {
					const cost = await scenarioCost(context, app, page, scenario);
					const trace = await scenarioLatencies(context, app, page, scenario);
					if (!isMeasured) continue;

					const key = [pageName, "scenarios", scenarioName, app];
					record([...key, "scriptMsPerInteraction"], cost.scriptMs);
					record([...key, "styleLayoutMsPerInteraction"], cost.styleLayoutMs);
					record([...key, "taskMsPerInteraction"], cost.taskMs);
					record([...key, "latencyP50Ms"], percentile(trace, 0.5));
					record([...key, "latencyP95Ms"], percentile(trace, 0.95));
					(latencies[key.join(".")] ??= []).push(...trace);
					(domNodes[pageName] ??= {} as Record<AppName, DomNodes>)[app] =
						cost.domNodes;
				}
			}

			if (context.onlyScenario) continue;

			for (const app of order) {
				if (!page.revalidation) continue;
				const result = await revalidationCost(context, app, page, page.revalidation);
				if (!isMeasured) continue;

				const key = [pageName, "revalidation", app];
				record([...key, "scriptMsPerUpdate"], result.scriptMs);
				record([...key, "styleLayoutMsPerUpdate"], result.styleLayoutMs);
				record([...key, "taskMsPerUpdate"], result.taskMs);
				record([...key, "updateToPaintP50Ms"], percentile(result.toPaintMs, 0.5));
				record([...key, "updateToPaintP95Ms"], percentile(result.toPaintMs, 0.95));
			}

			for (const app of order) {
				const cold = await hydration(context, app, page, "cold");
				const warm = await hydration(context, app, page, "warm");
				const navigation = await softNavigationAndMemory(context, app, page);
				if (!isMeasured) continue;

				for (const [kind, result] of Object.entries({ cold, warm })) {
					for (const [metric, value] of Object.entries(result)) {
						record([pageName, "hydration", kind, app, metric], value);
					}
				}
				for (const [metric, value] of Object.entries(navigation)) {
					record([pageName, "softNavigation", app, metric], value);
				}
			}
		}
		context.sampleLoad();
	}

	return {
		config: {
			runs,
			discardedRuns: DISCARDED_RUNS,
			cpuThrottleRate: context.cpuThrottleRate,
			interactionGapMs: INTERACTION_GAP_MS,
			viewport: VIEWPORT,
			softNavigationRoundTrips: SOFT_NAVIGATION_ROUND_TRIPS,
			warmLoad: `load #${WARM_LOAD_INDEX + 1} of the page in one browser context`,
		},
		pages: Object.fromEntries(
			Object.entries(pages).map(([pageName, page]) => [
				pageName,
				{
					path: page.path,
					scenarioDescriptions: Object.fromEntries(
						Object.entries(page.scenarios).map(([name, scenario]) => [
							name,
							scenario.description,
						]),
					),
					revalidationDescription: page.revalidation?.description,
					domNodes: domNodes[pageName],
					...summarize(samples, pageName),
					pooledLatency: Object.fromEntries(
						Object.entries(latencies)
							.filter(([key]) => key.startsWith(`${pageName}.`))
							.map(([key, values]) => [
								key.slice(pageName.length + 1),
								{
									interactions: values.length,
									p50Ms: round2(percentile(values, 0.5)),
									p95Ms: round2(percentile(values, 0.95)),
								},
							]),
					),
				},
			]),
		),
	};
}

type Samples = Record<string, number[]>;

interface DomNodes {
	document: number;
	main: number;
}

/** Nests the flat `a.b.c` sample keys of one page into `{ a: { b: { c: { samples, median, best, spreadPct } } } }`. */
function summarize(samples: Samples, pageName: string) {
	const result: Record<string, unknown> = {};
	for (const [key, values] of Object.entries(samples)) {
		const parts = key.split(".");
		if (parts[0] !== pageName) continue;

		let node = result;
		for (const part of parts.slice(1, -1)) {
			node = (node[part] ??= {}) as Record<string, unknown>;
		}
		const middle = median(values);
		node[parts.at(-1)!] = {
			samples: values.map(round2),
			median: round2(middle),
			best: round2(Math.min(...values)),
			// how far apart the runs are, to tell a difference between the apps from noise
			spreadPct:
				middle === 0
					? 0
					: Math.round(((Math.max(...values) - Math.min(...values)) / middle) * 100),
		};
	}
	return result;
}

// ---- one scenario ----

/** CPU time per interaction from Chromium's own counters, taken around the measured cycles. */
async function scenarioCost(
	context: InteractionContext,
	app: AppName,
	measuredPage: MeasuredPage,
	scenario: Scenario,
) {
	const { page, cdp, close } = await openPage(context);
	try {
		await loadPage(page, context.origins[app] + measuredPage.path);
		const domNodes = await countDomNodes(page);
		const cycle = await prepareScenario(page, scenario);

		const before = await metrics(cdp);
		const interactions = await replay(page, cycle, scenario.repetitions);
		await page.waitForTimeout(INTERACTION_GAP_MS);
		const after = await metrics(cdp);
		await scenario.assertEndState?.(page);

		const perInteraction = (name: string) =>
			((after[name] - before[name]) * 1000) / interactions;

		return {
			scriptMs: perInteraction("ScriptDuration"),
			styleLayoutMs:
				perInteraction("RecalcStyleDuration") + perInteraction("LayoutDuration"),
			taskMs: perInteraction("TaskDuration"),
			domNodes,
		};
	} finally {
		await close();
	}
}

/** Per interaction, from its first input event to the main thread painting the frame after its last one, read off a trace. */
async function scenarioLatencies(
	context: InteractionContext,
	app: AppName,
	measuredPage: MeasuredPage,
	scenario: Scenario,
) {
	const { page, close } = await openPage(context);
	try {
		await loadPage(page, context.origins[app] + measuredPage.path);
		const cycle = await prepareScenario(page, scenario);

		await context.browser.startTracing(page, {
			categories: ["devtools.timeline"],
		});
		const interactions = await replay(page, cycle, scenario.repetitions);
		await page.waitForTimeout(INTERACTION_GAP_MS);
		const trace = await context.browser.stopTracing();
		await scenario.assertEndState?.(page);

		const latencies = interactionLatencies(trace);
		if (latencies.length !== interactions) {
			console.error(
				`interactions: ${app} ${measuredPage.path}: traced ${latencies.length} interactions, expected ${interactions}`,
			);
		}
		return latencies;
	} finally {
		await close();
	}
}

type ResolvedStep =
	| { click: { x: number; y: number } }
	| { press: string }
	| { insertText: string };

/**
 * Runs the setup and two warm-up cycles, the second one recording where each click landed: the measured cycles
 * replay those coordinates through CDP input events alone, so that Playwright's actionability checks (scripts
 * of their own in the page) stay out of the numbers. The first cycle may differ (e.g. a form not yet submitted).
 */
async function prepareScenario(page: Page, scenario: Scenario) {
	for (const step of scenario.setup ?? []) await perform(page, step);

	let recorded: ResolvedStep[] = [];
	for (let warmUp = 0; warmUp < 2; warmUp++) {
		recorded = [];
		for (const step of scenario.cycle) recorded.push(await perform(page, step));
	}
	await page.waitForTimeout(300);

	return recorded;
}

async function perform(page: Page, step: Step): Promise<ResolvedStep> {
	if ("click" in step) {
		const box = await page.locator(step.click).boundingBox();
		if (!box) throw new Error(`Nothing to click at "${step.click}"`);
		const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await page.mouse.click(point.x, point.y);
		await page.waitForTimeout(INTERACTION_GAP_MS);
		return { click: point };
	}

	await replayStep(page, step);
	return step;
}

async function replay(page: Page, cycle: ResolvedStep[], repetitions: number) {
	for (let i = 0; i < repetitions; i++) {
		for (const step of cycle) await replayStep(page, step);
	}
	return cycle.length * repetitions;
}

async function replayStep(page: Page, step: ResolvedStep) {
	if ("click" in step) {
		await page.mouse.click(step.click.x, step.click.y);
	} else if ("press" in step) {
		await page.keyboard.press(step.press);
	} else {
		await page.keyboard.insertText(step.insertText);
	}
	await page.waitForTimeout(INTERACTION_GAP_MS);
}

interface TraceEvent {
	name: string;
	ph: string;
	ts: number;
	dur?: number;
	pid: number;
	tid: number;
	args?: { name?: string; data?: { type?: string } };
}

/**
 * Groups the renderer's discrete input events into interactions (the gap between interactions is far longer than
 * between the events of one) and takes, like INP, the longest of each event's time to the next main thread paint.
 */
function interactionLatencies(trace: Buffer) {
	const { traceEvents } = JSON.parse(trace.toString("utf8")) as {
		traceEvents: TraceEvent[];
	};

	const dispatches = traceEvents.filter(
		(event) =>
			event.name === "EventDispatch" &&
			event.ph === "X" &&
			INTERACTION_EVENT_TYPES.has(event.args?.data?.type ?? ""),
	);
	const mainThread = mostCommonThread(dispatches);
	const onMainThread = (event: TraceEvent) =>
		`${event.pid}:${event.tid}` === mainThread;
	const ownDispatches = dispatches
		.filter(onMainThread)
		.toSorted((a, b) => a.ts - b.ts);
	const paints = traceEvents
		.filter((event) => event.name === "Paint" && event.ph === "X")
		.filter(onMainThread)
		.toSorted((a, b) => a.ts - b.ts);

	const clusters: TraceEvent[][] = [];
	let previousEnd = Number.NEGATIVE_INFINITY;
	for (const dispatch of ownDispatches) {
		if (dispatch.ts - previousEnd > INTERACTION_CLUSTER_GAP_MS * 1000) {
			clusters.push([]);
		}
		clusters.at(-1)!.push(dispatch);
		previousEnd = Math.max(previousEnd, dispatch.ts + (dispatch.dur ?? 0));
	}

	return clusters.flatMap((cluster, index) => {
		const nextClusterStart = clusters[index + 1]?.[0]?.ts ?? Number.POSITIVE_INFINITY;
		const eventLatencies = cluster.flatMap((dispatch) => {
			const end = dispatch.ts + (dispatch.dur ?? 0);
			const paint = paints.find((candidate) => candidate.ts >= end);
			if (!paint || paint.ts > nextClusterStart) return [];
			return [(paint.ts + (paint.dur ?? 0) - dispatch.ts) / 1000];
		});
		return eventLatencies.length > 0 ? [Math.max(...eventLatencies)] : [];
	});
}

function mostCommonThread(events: TraceEvent[]) {
	const counts = new Map<string, number>();
	for (const event of events) {
		const key = `${event.pid}:${event.tid}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0];
}

// ---- revalidation ----

const REVALIDATION_WARM_UPS = 2;

/**
 * CPU time per update around the measured revalidations, each timed in the page from asking the router to
 * revalidate (React Router's `revalidate()`, SvelteKit's `refreshAll()`) to the painted frame showing the change.
 */
async function revalidationCost(
	context: InteractionContext,
	app: AppName,
	measuredPage: MeasuredPage,
	revalidation: Revalidation,
) {
	const { page, cdp, close } = await openPage(context);
	try {
		await loadPage(page, context.uncachedOrigins[app] + measuredPage.path);

		let index = 0;
		const update = async () => {
			revalidation.changeOnServer(index);
			const toPaintMs = await revalidateUntilShown(page, {
				selector: revalidation.selector,
				expectedText: revalidation.expectedText(index),
			});
			index++;
			await page.waitForTimeout(INTERACTION_GAP_MS);
			return toPaintMs;
		};

		for (let i = 0; i < REVALIDATION_WARM_UPS; i++) await update();
		await page.waitForTimeout(300);

		const before = await metrics(cdp);
		const toPaintMs: number[] = [];
		for (let i = 0; i < revalidation.updates; i++) toPaintMs.push(await update());
		const after = await metrics(cdp);

		const perUpdate = (name: string) =>
			((after[name] - before[name]) * 1000) / revalidation.updates;

		return {
			scriptMs: perUpdate("ScriptDuration"),
			styleLayoutMs:
				perUpdate("RecalcStyleDuration") + perUpdate("LayoutDuration"),
			taskMs: perUpdate("TaskDuration"),
			toPaintMs,
		};
	} finally {
		revalidation.restore();
		await close();
	}
}

async function revalidateUntilShown(
	page: Page,
	args: { selector: string; expectedText: string },
) {
	return page.evaluate(
		({ selector, expectedText, timeoutMs }) =>
			new Promise<number>((resolve, reject) => {
				const startedAt = performance.now();
				const reactRouter = (
					window as unknown as {
						__reactRouterDataRouter?: { revalidate: () => unknown };
					}
				).__reactRouterDataRouter;
				if (reactRouter) {
					void reactRouter.revalidate();
				} else {
					void (
						window as unknown as { __sveltekitRefreshAll: () => Promise<void> }
					).__sveltekitRefreshAll();
				}

				const channel = new MessageChannel();
				channel.port1.onmessage = () => resolve(performance.now() - startedAt);
				const check = () => {
					if (document.querySelector(selector)?.textContent?.trim() === expectedText) {
						// posted from the frame that shows the change, so it is handled once that frame is painted
						channel.port2.postMessage(null);
						return;
					}
					if (performance.now() - startedAt > timeoutMs) {
						reject(new Error(`"${selector}" never showed "${expectedText}"`));
						return;
					}
					requestAnimationFrame(check);
				};
				requestAnimationFrame(check);
			}),
		{ ...args, timeoutMs: SOFT_NAVIGATION_TIMEOUT_MS },
	);
}

// ---- hydration ----

/**
 * Script and long task time from navigation start to the hydrated mark. Cold: a fresh browser context, so nothing
 * is cached. Warm: the same page loaded again in one context until V8 runs it from its code cache.
 */
async function hydration(
	context: InteractionContext,
	app: AppName,
	measuredPage: MeasuredPage,
	kind: "cold" | "warm",
) {
	const browserContext = await newBrowserContext(context);
	try {
		const loads = kind === "cold" ? 1 : WARM_LOAD_INDEX + 1;
		let result: Awaited<ReturnType<typeof loadUntilHydrated>> | undefined;
		for (let load = 0; load < loads; load++) {
			const page = await browserContext.newPage();
			const cdp = await browserContext.newCDPSession(page);
			await cdp.send("Performance.enable");
			await cdp.send("Emulation.setCPUThrottlingRate", {
				rate: context.cpuThrottleRate,
			});
			result = await loadUntilHydrated(
				page,
				cdp,
				context.origins[app] + measuredPage.path,
			);
			// lets the code cache be written before the next load
			await page.waitForLoadState("networkidle");
			await page.close();
		}

		return result!;
	} finally {
		await browserContext.close();
	}
}

async function loadUntilHydrated(page: Page, cdp: CDPSession, url: string) {
	let resolveHydrated: (markTime: number) => void = () => {};
	const hydrated = new Promise<number>((resolve) => {
		resolveHydrated = resolve;
	});
	await page.exposeBinding("__measureHydrated", (_source, markTime: number) =>
		resolveHydrated(markTime),
	);
	await page.addInitScript((markName) => {
		const longTasks: Array<{ startTime: number; duration: number }> = [];
		Object.assign(window, { __measureLongTasks: longTasks });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				longTasks.push({ startTime: entry.startTime, duration: entry.duration });
			}
		}).observe({ type: "longtask" });

		const mark = performance.mark.bind(performance);
		performance.mark = (name, options) => {
			const entry = mark(name, options);
			if (name === markName) {
				(window as unknown as { __measureHydrated: (time: number) => void })
					.__measureHydrated(entry.startTime);
			}
			return entry;
		};
	}, HYDRATED_MARK);

	const navigation = page.goto(url);
	const hydratedAt = await hydrated;
	const counters = await metrics(cdp);
	const longTasks = await page.evaluate(
		() =>
			(
				window as unknown as {
					__measureLongTasks: Array<{ startTime: number; duration: number }>;
				}
			).__measureLongTasks,
	);

	const result = {
		scriptMs: counters.ScriptDuration * 1000,
		taskMs: counters.TaskDuration * 1000,
		longTaskMs: longTasks
			.filter((task) => task.startTime < hydratedAt)
			.reduce((sum, task) => sum + task.duration, 0),
		hydratedAtMs: hydratedAt,
	};
	await navigation;

	return result;
}

// ---- soft navigation and memory ----

/**
 * First, from a freshly loaded light page into the page, which also loads its code. Then the page loaded, its heap
 * measured, client-side navigations between it and the light page, each into the page timed, and the heap again.
 */
async function softNavigationAndMemory(
	context: InteractionContext,
	app: AppName,
	measuredPage: MeasuredPage,
) {
	const first = await openPage(context);
	let firstNavigation: Awaited<ReturnType<typeof softNavigation>>;
	try {
		await loadPage(first.page, context.origins[app] + LIGHT_PAGE.path);
		firstNavigation = await softNavigation(first.page, first.cdp, measuredPage);
	} finally {
		await first.close();
	}

	const { page, cdp, close } = await openPage(context);
	try {
		await loadPage(page, context.origins[app] + measuredPage.path);
		const heapAfterLoadMb = await heapMb(cdp);

		const repeated: Array<Awaited<ReturnType<typeof softNavigation>>> = [];
		for (let i = 0; i < SOFT_NAVIGATION_ROUND_TRIPS; i++) {
			await softNavigation(page, cdp, LIGHT_PAGE);
			repeated.push(await softNavigation(page, cdp, measuredPage));
		}
		await page.waitForLoadState("networkidle");
		const heapAfterNavigationsMb = await heapMb(cdp);

		return {
			firstScriptMs: firstNavigation.scriptMs,
			firstTimeToPaintMs: firstNavigation.timeToPaintMs,
			repeatedScriptMs: median(repeated.map((nav) => nav.scriptMs)),
			repeatedTimeToPaintMs: median(repeated.map((nav) => nav.timeToPaintMs)),
			heapAfterLoadMb,
			heapAfterNavigationsMb,
		};
	} finally {
		await close();
	}
}

/**
 * A client-side navigation the way each router starts one: React Router's own navigate (what its `<Link>` calls),
 * a click on an anchor for SvelteKit, which handles every anchor in the app. Timed until the frame showing the
 * destination's content has been painted.
 */
async function softNavigation(
	page: Page,
	cdp: CDPSession,
	destination: { path: string; readySelector: string },
) {
	const before = await metrics(cdp);
	const timeToPaintMs = await page.evaluate(
		({ path, readySelector, timeoutMs }) =>
			new Promise<number>((resolve, reject) => {
				const startedAt = performance.now();
				const router = (
					window as unknown as {
						__reactRouterDataRouter?: { navigate: (to: string) => void };
					}
				).__reactRouterDataRouter;
				if (router) {
					router.navigate(path);
				} else {
					const anchor = document.createElement("a");
					anchor.href = path;
					document.querySelector("main")!.append(anchor);
					anchor.click();
					anchor.remove();
				}

				const channel = new MessageChannel();
				channel.port1.onmessage = () => resolve(performance.now() - startedAt);
				const check = () => {
					if (
						location.pathname + location.search === path &&
						document.querySelector(readySelector)
					) {
						// posted from the frame that shows the content, so it is handled once that frame is painted
						channel.port2.postMessage(null);
						return;
					}
					if (performance.now() - startedAt > timeoutMs) {
						reject(new Error(`Soft navigation to ${path} did not show "${readySelector}"`));
						return;
					}
					requestAnimationFrame(check);
				};
				requestAnimationFrame(check);
			}),
		{
			path: destination.path,
			readySelector: destination.readySelector,
			timeoutMs: SOFT_NAVIGATION_TIMEOUT_MS,
		},
	);
	const after = await metrics(cdp);

	return {
		scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
		timeToPaintMs,
	};
}

async function heapMb(cdp: CDPSession) {
	await cdp.send("HeapProfiler.collectGarbage");
	await cdp.send("HeapProfiler.collectGarbage");
	return (await metrics(cdp)).JSHeapUsedSize / 1024 / 1024;
}

// ---- helpers ----

/** Signed in through the cookie jar: a cookie header set on the context does not reach React Router's data fetches. */
async function newBrowserContext(context: InteractionContext) {
	const browserContext = await context.browser.newContext({
		serviceWorkers: "block",
		viewport: VIEWPORT,
	});
	const [name, value] = context.sessionCookie.split(/=(.*)/s);
	await browserContext.addCookies([
		{
			name,
			value,
			domain: "localhost",
			path: "/",
			secure: true,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	return browserContext;
}

async function openPage(context: InteractionContext) {
	const browserContext = await newBrowserContext(context);
	const page = await browserContext.newPage();
	const cdp = await browserContext.newCDPSession(page);
	await cdp.send("Performance.enable");
	await cdp.send("Emulation.setCPUThrottlingRate", {
		rate: context.cpuThrottleRate,
	});

	return { page, cdp, close: () => browserContext.close() };
}

/** Loaded, hydrated and done with what it fetches once idle (React preloads its translations), so none of it lands in a measurement. */
async function loadPage(page: Page, url: string) {
	await page.goto(url);
	await waitUntilHydrated(page);
	await page.waitForLoadState("networkidle");
}

async function waitUntilHydrated(page: Page) {
	await page.waitForFunction(
		(markName) => performance.getEntriesByName(markName).length > 0,
		HYDRATED_MARK,
	);
}

async function countDomNodes(page: Page): Promise<DomNodes> {
	return page.evaluate(() => ({
		document: document.querySelectorAll("*").length,
		main: document.querySelectorAll("main *").length,
	}));
}

async function metrics(cdp: CDPSession) {
	const { metrics: entries } = await cdp.send("Performance.getMetrics");
	return Object.fromEntries(
		entries.map((entry) => [entry.name, entry.value]),
	) as Record<string, number>;
}

async function expectValue(page: Page, selector: string, expected: string) {
	const value = await page.locator(selector).inputValue();
	if (value !== expected) {
		throw new Error(`Expected "${selector}" to hold "${expected}", got "${value}"`);
	}
}

async function expectCount(page: Page, selector: string, expected: number) {
	const count = await page.locator(selector).count();
	if (count !== expected) {
		throw new Error(`Expected ${expected} of "${selector}", got ${count}`);
	}
}

function percentile(values: number[], quantile: number) {
	if (values.length === 0) return Number.NaN;
	const sorted = values.toSorted((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function median(values: number[]) {
	return percentile(values, 0.5);
}

function round2(value: number) {
	return Math.round(value * 100) / 100;
}

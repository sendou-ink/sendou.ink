// What the sweep does to one page, pass by pass. Shared by `sweep.mjs` (every page of the manifest)
// and `selftest.mjs` (the fixture pages with one planted defect per rule), so the self-test
// exercises the code the sweep runs.
//
// Every pass takes the page and a `ctx`:
//   { recorder, entry, viewportName, tested, options }
// `tested` holds what was already checked across the run (hover, focus and the rest are tested
// once per component signature), `options` the limits of `defaultOptions`.
import fs from "node:fs";
import {
	isReadOnly,
	isTouchViewport,
	makeFlickerGif,
	SWEEP_WIDTHS,
	settle,
	shootMarked,
	shotBase64,
	VIEWPORTS,
	videoToGif,
	viewportClassOf,
	visit,
	visitInfo,
	writesBlocked,
} from "./lib.mjs";

const STATIC_PROBES = [
	"overflow",
	"overlap",
	"horizontal-scroll",
	"images",
	"raw-keys",
	"junk",
	"contrast",
	"ui-contrast",
	"centering",
	"wrapping",
	"truncation",
	"squashed",
	"alignment",
	"scrollers",
	"fixed-bars",
];
/** What a change of width can break. */
const WIDTH_PROBES = [
	"horizontal-scroll",
	"overflow",
	"overlap",
	"wrapping",
	"squashed",
];
/** Run inside a dialog, popover or menu once it is open. */
const OVERLAY_PROBES = [
	"overflow",
	"overlap",
	"images",
	"raw-keys",
	"junk",
	"contrast",
	"ui-contrast",
	"centering",
	"wrapping",
	"truncation",
	"squashed",
	"scrollers",
];
/** Run on the page again after a click changed it (a section revealed, validation messages shown). */
const STATE_PROBES = [
	"overflow",
	"overlap",
	"horizontal-scroll",
	"raw-keys",
	"junk",
	"contrast",
	"wrapping",
	"squashed",
];
const HYDRATION_ERROR = /Minified React error #(418|421|422|423|425)\b/;
const IGNORED_FAILURES =
	/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT|ERR_NAME_NOT_RESOLVED/;
const CHECKED_RESOURCES = new Set([
	"image",
	"font",
	"stylesheet",
	"script",
	"fetch",
	"xhr",
	"media",
]);

export function defaultOptions(overrides = {}) {
	return {
		hoverPerPage: 45,
		focusPerPage: 45,
		tabStops: 60,
		centerPerPage: 30,
		contrastSamplesPerPage: 20,
		actionsPerPage: 8,
		explorePerPage: 12,
		widths: SWEEP_WIDTHS,
		/** Chromium does not report a move under 3px as a layout shift at all. */
		minShiftPx: 3,
		idleMs: 2000,
		scrollSteps: 8,
		...overrides,
	};
}

export function newTested() {
	return {
		hover: new Set(),
		press: new Set(),
		focus: new Set(),
		focusWalk: new Set(),
		center: new Set(),
		contrast: new Set(),
		actions: new Set(),
	};
}

function contextOf(ctx, extra = {}) {
	return {
		entry: ctx.entry,
		viewportName: ctx.viewportName,
		theme: "dark",
		lang: ctx.options.lang,
		...extra,
	};
}

// ------------------------------------------------------------------- watching

/**
 * Collects what goes wrong while a page is open (script errors, failed requests, console errors);
 * the returned function records it once the page is done.
 */
export function watchPage(page, ctx) {
	const errors = [];
	const consoleErrors = [];
	const failed = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const text = message.text();
		// the request itself is reported as failed-request
		if (/Failed to load resource/.test(text)) return;
		// the page noticing that a read-only session cut its write off
		if (isReadOnly(page.context()) && /Failed to fetch/.test(text)) return;
		consoleErrors.push(text);
	});
	page.on("requestfailed", (request) => {
		const reason = request.failure()?.errorText ?? "failed";
		if (IGNORED_FAILURES.test(reason)) return;
		if (!CHECKED_RESOURCES.has(request.resourceType())) return;
		failed.push({ url: request.url(), reason });
	});
	page.on("response", (response) => {
		if (response.status() < 400) return;
		const request = response.request();
		if (!CHECKED_RESOURCES.has(request.resourceType())) return;
		if (request.method() !== "GET") return;
		failed.push({
			url: response.url(),
			reason: `answered ${response.status()}`,
		});
	});

	return () => {
		const { recorder, entry } = ctx;
		const context = contextOf(ctx);
		for (const message of errors) {
			const rule = HYDRATION_ERROR.test(message)
				? "hydration-mismatch"
				: "js-error";
			recorder.add(
				`${rule}|${entry.route}|${message.slice(0, 60)}`,
				{
					rule,
					sig: entry.route,
					detail: message.split("\n")[0].slice(0, 240),
				},
				context,
			);
		}
		for (const message of consoleErrors) {
			// the same error with another request id or number is the same error, on whatever page
			const text = message
				.split("\n")[0]
				.replace(/^\[[A-Za-z0-9]{5,12}\]\s*/, "")
				.slice(0, 240);
			recorder.add(
				`console-error|${text.replace(/\d+/g, "N").slice(0, 80)}`,
				{
					rule: "console-error",
					sig: text.slice(0, 80),
					detail: `logged to the console as an error: ${text}`,
				},
				context,
			);
		}
		for (const { url, reason } of failed) {
			const address = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
			recorder.add(
				`failed-request|${address.replace(/\d+/g, "N")}`,
				{
					rule: "failed-request",
					sig: address,
					detail: `the page asks for ${url.slice(0, 160)}, which ${reason}`,
				},
				context,
			);
		}
	};
}

/** Opens the entry's page. False (with the reason recorded) when there is nothing to look at. */
export async function open(page, ctx) {
	const { recorder, entry } = ctx;
	const context = contextOf(ctx);
	const info = await visitInfo(page, entry.url);
	if (info.status >= 400 || info.status === 0) {
		recorder.add(
			`error-page|${entry.url}`,
			{
				rule: "error-page",
				sig: entry.url,
				detail: `responds with ${info.status}`,
			},
			context,
		);
		return false;
	}
	if (!info.hydrated) {
		recorder.add(
			`not-hydrated|${entry.route}`,
			{
				rule: "not-hydrated",
				sig: entry.route,
				detail:
					"the page never became interactive: its scripts did not finish starting up (nothing on it can be clicked)",
			},
			context,
		);
	}
	if (info.clientRedirect) {
		recorder.add(
			`client-redirect|${entry.route}`,
			{
				rule: "client-redirect",
				sig: entry.route,
				detail: `the server shows this page first and the browser then moves on to ${info.clientRedirect}: a redirect done on the client, one flash of the wrong page`,
			},
			context,
		);
	}
	return true;
}

// --------------------------------------------------------------------- static

export async function staticPass(page, ctx) {
	const { recorder, viewportName } = ctx;
	const context = contextOf(ctx);
	await primeLazyContent(page);
	await recorder.noteTokens(page);

	const probes = [
		...STATIC_PROBES,
		...(isTouchViewport(viewportName) ? ["tap-targets"] : []),
	];
	await recorder.recordAll(page, await run(page, probes), context);
	await sampleContrast(page, ctx, context);
	await inkCentering(page, ctx, context);

	// colors transition when the theme flips: measured mid-way they are neither theme's
	await page.evaluate(() => window.__polish.freezeTransitions(true));
	await page.emulateMedia({ colorScheme: "light" });
	await page.waitForTimeout(350);
	const light = { ...context, theme: "light" };
	await recorder.recordAll(
		page,
		await run(page, ["contrast", "ui-contrast"]),
		light,
	);
	await sampleContrast(page, ctx, light);
	await page.emulateMedia({ colorScheme: "dark" });
	await page.waitForTimeout(350);
	await page.evaluate(() => window.__polish.freezeTransitions(false));

	recorder.noteCensus(
		context,
		await page.evaluate(() => window.__polish.census()).catch(() => null),
	);
	recorder.noteModules(
		ctx.entry.url,
		await page.evaluate(() => window.__polish.moduleHashes()).catch(() => []),
	);
}

/** Scrolls through the page once: lazy images and whatever waits to be scrolled to are there for the probes. */
async function primeLazyContent(page) {
	const scrolled = await page
		.evaluate(async () => {
			const max = document.documentElement.scrollHeight - innerHeight;
			if (max < 50) return false;
			const end = Math.min(max, innerHeight * 12);
			for (let y = 0; y < end; y += innerHeight * 0.8) {
				scrollTo({ top: y, behavior: "instant" });
				await new Promise((resolve) => setTimeout(resolve, 60));
			}
			scrollTo({ top: 0, behavior: "instant" });
			return true;
		})
		.catch(() => false);
	if (scrolled) await settle(page, { quiet: 100 });
}

/**
 * Texts over a picture, gradient or blur have no background color to compute a contrast from: the
 * pixels behind them are sampled instead (a screenshot with the text made invisible).
 */
async function sampleContrast(page, ctx, context) {
	const { recorder, tested, options } = ctx;
	const unmeasured = await page
		.evaluate(() => window.__polish.unmeasuredContrast())
		.catch(() => []);
	let sampled = 0;
	for (const item of unmeasured) {
		const testedKey = `${item.sig}|${context.theme}`;
		if (tested.contrast.has(testedKey)) continue;
		if (sampled >= options.contrastSamplesPerPage) {
			recorder.count("contrastNotMeasured");
			continue;
		}
		tested.contrast.add(testedKey);
		sampled++;

		if (!(await reveal(page, item.nodeId))) continue;
		const box = await evaluate(
			page,
			(id) => window.__polish.textBox(id),
			item.nodeId,
		);
		if (!box) continue;
		await evaluate(
			page,
			(id) => window.__polish.hideText(id, true),
			item.nodeId,
		);
		const shot = await shotBase64(page, box.rect);
		await evaluate(
			page,
			(id) => window.__polish.hideText(id, false),
			item.nodeId,
		);
		if (!shot) continue;
		const result = await evaluate(
			page,
			([textBox, image]) => window.__polish.contrastOverPixels(textBox, image),
			[box, shot],
		);
		if (!result) continue;
		recorder.count("contrastSampled");
		if (result.worstFifth >= result.required - 0.05) continue;
		await recorder.record(
			page,
			{
				...item,
				rule: "low-contrast",
				overPicture: true,
				detail: `over a picture or gradient: ${result.worstFifth.toFixed(2)}:1 against the worst fifth of what is behind the text (needs ${result.required}:1; ${result.median.toFixed(2)}:1 against the middle of it, ${result.lowest.toFixed(2)}:1 at the worst spot), text ${result.text} on ${result.background}`,
			},
			context,
		);
	}
}

/**
 * Whether what is drawn in a small control sits in the middle of it, measured on the pixels: a box
 * can be centered while the icon inside its own box, or a number in its line, is not.
 */
async function inkCentering(page, ctx, context) {
	const { recorder, tested, options } = ctx;
	const candidates = await page
		.evaluate(
			(skip) => window.__polish.listCenterCandidates(skip),
			[...tested.center],
		)
		.catch(() => []);
	if (candidates.length === 0) return;
	await page.mouse.move(1, 1);
	const scale = await page.evaluate(() => devicePixelRatio);

	for (const candidate of candidates.slice(0, options.centerPerPage)) {
		tested.center.add(candidate.sig);
		const position = await reveal(page, candidate.nodeId);
		if (!position?.reachable) continue;
		const clip = wholePixels(position.rect);
		const shot = await shotBase64(page, clip);
		if (!shot) continue;
		const gaps = await evaluate(
			page,
			([id, image, ratio, inset]) =>
				window.__polish.inkGaps(id, image, ratio, inset),
			[
				candidate.nodeId,
				shot,
				scale,
				{
					left: position.rect.x - clip.x,
					top: position.rect.y - clip.y,
					right: clip.x + clip.width - (position.rect.x + position.rect.width),
					bottom:
						clip.y + clip.height - (position.rect.y + position.rect.height),
				},
			],
		);
		if (!gaps) continue;
		const offX = Math.abs(gaps.left - gaps.right);
		const offY = Math.abs(gaps.top - gaps.bottom);
		const limit = candidate.kind === "icon" ? 2 : 2.5;
		// a small difference reads as "meant to be centered but isn't", a large one as an alignment choice
		const isOffX = offX > limit && offX <= 12;
		const isOffY = candidate.vertical && offY > limit && offY <= 12;
		if (!isOffX && !isOffY) continue;
		await recorder.record(
			page,
			{
				...candidate,
				rule: "off-center",
				detail: `what is drawn sits off the middle of its box: ${gaps.left.toFixed(1)}/${gaps.right.toFixed(1)}px of empty space left/right, ${gaps.top.toFixed(1)}/${gaps.bottom.toFixed(1)}px top/bottom (measured on the pixels of the ${candidate.kind})`,
			},
			context,
		);
	}
}

// ---------------------------------------------------------------- interactive

/** Hover feedback and the cursor of every clickable component, with a real pointer. Not for touch screens. */
export async function hoverPass(page, ctx) {
	const { recorder, tested, options } = ctx;
	const context = contextOf(ctx);
	const candidates = await page.evaluate(
		(skip) => window.__polish.listInteractive(skip),
		[...tested.hover],
	);

	for (const candidate of candidates.slice(0, options.hoverPerPage)) {
		if (tested.hover.has(candidate.sig) || !candidate.expectsHover) continue;
		const position = await reveal(page, candidate.nodeId);
		if (!position?.reachable) continue;

		await page.mouse.move(1, 1);
		await page.waitForTimeout(60);
		const before = await snapshot(page, candidate.nodeId);
		await page.mouse.move(position.x, position.y);
		await page.waitForTimeout(240);
		const after = await snapshot(page, candidate.nodeId);
		if (!before || !after?.hovered) continue;
		tested.hover.add(candidate.sig);

		if (before.signature === after.signature) {
			// styles the snapshot can't see (a sibling, a descendant's pseudo element): compare the pixels
			await page.mouse.move(1, 1);
			await page.waitForTimeout(260);
			const clip = padded(position.rect, page.viewportSize());
			const restPixels = await page.screenshot({ clip }).catch(() => null);
			await page.mouse.move(position.x, position.y);
			await page.waitForTimeout(300);
			const hoverPixels = await page.screenshot({ clip }).catch(() => null);
			if (!restPixels || !hoverPixels || !restPixels.equals(hoverPixels))
				continue;
			// a preview shown next to the control (not a popover, a sibling revealed by CSS) is feedback as well
			const around = padded(position.rect, page.viewportSize(), 140);
			const hoverAround = await page
				.screenshot({ clip: around })
				.catch(() => null);
			await page.mouse.move(1, 1);
			await page.waitForTimeout(300);
			const restAround = await page
				.screenshot({ clip: around })
				.catch(() => null);
			await page.mouse.move(position.x, position.y);
			if (!restAround || !hoverAround || !restAround.equals(hoverAround))
				continue;
			// a menu or tooltip that opens on hover is feedback too, and opens after a delay
			await page.waitForTimeout(250);
			const late = await snapshot(page, candidate.nodeId);
			if (late && late.signature !== before.signature) continue;
			await recorder.record(
				page,
				{
					...candidate,
					rule: "no-hover-feedback",
					detail: `nothing changes when the pointer is over it (cursor: ${after.cursor})`,
				},
				context,
			);
		} else if (
			after.cursor !== "pointer" &&
			candidate.tag !== "label" &&
			candidate.tag !== "select"
		) {
			await recorder.record(
				page,
				{
					...candidate,
					rule: "cursor-not-pointer",
					detail: `clickable but the cursor stays "${after.cursor}"`,
				},
				context,
			);
		}
	}
	await page.mouse.move(1, 1);
}

/**
 * On a touch screen nothing hovers: the feedback is what shows while the finger is down. The
 * pressed state is forced on each control (no click happens) and compared with the control at rest.
 */
export async function pressPass(page, ctx) {
	const { recorder, tested, options } = ctx;
	const context = contextOf(ctx);
	const candidates = await page.evaluate(
		(skip) => window.__polish.listInteractive(skip),
		[...tested.press],
	);
	if (candidates.length === 0) return;

	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("DOM.enable");
		await cdp.send("CSS.enable");
		await cdp.send("DOM.getDocument", { depth: 0 });

		for (const candidate of candidates.slice(0, options.hoverPerPage)) {
			if (!candidate.expectsHover) continue;
			const position = await reveal(page, candidate.nodeId);
			if (!position?.reachable) continue;
			const before = await snapshot(page, candidate.nodeId);
			if (!before) continue;
			tested.press.add(candidate.sig);
			// the browser flashes its own highlight over a tapped control
			if (before.tapHighlight > 0.02) continue;

			const clip = padded(position.rect, page.viewportSize());
			const restPixels = await page.screenshot({ clip }).catch(() => null);
			const { result } = await cdp.send("Runtime.evaluate", {
				expression: `window.__polish.elementOf(${candidate.nodeId})`,
			});
			if (!result?.objectId) continue;
			const { nodeId } = await cdp.send("DOM.requestNode", {
				objectId: result.objectId,
			});
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: ["active"],
			});
			await page.waitForTimeout(200);
			const pressed = await snapshot(page, candidate.nodeId);
			const pressedPixels = await page.screenshot({ clip }).catch(() => null);
			await cdp.send("CSS.forcePseudoState", {
				nodeId,
				forcedPseudoClasses: [],
			});
			if (!pressed || !restPixels || !pressedPixels) continue;
			if (
				before.signature !== pressed.signature ||
				!restPixels.equals(pressedPixels)
			) {
				continue;
			}
			// the tap highlight is off for the whole site, so this is one finding per kind of control
			// with the components it holds for, not one per component
			const kind =
				candidate.tag === "a"
					? "links"
					: candidate.tag === "button"
						? "buttons"
						: "other controls";
			await recorder.record(
				page,
				{
					...candidate,
					rule: "no-press-feedback",
					sig: kind,
					component: candidate.sig,
					detail: `nothing changes while a finger is down on these ${kind}: no :active style, and the tap highlight is turned off (the components are listed with the finding)`,
				},
				context,
			);
		}
	} catch {
		// a page that navigated away under the session: the rest of its controls go untested
	} finally {
		await cdp.detach().catch(() => {});
	}
}

/**
 * Keyboard focus. Every focusable component is focused (in keyboard modality) and its pixels are
 * compared with the unfocused ones: no difference is no indicator, an outline that does not show on
 * every side is one cut off by a box around it. Then Tab is pressed through the page to find stops
 * that can't be seen at all.
 */
export async function focusPass(page, ctx) {
	const { recorder, tested, options } = ctx;
	const context = contextOf(ctx);
	const candidates = await page.evaluate(
		(skip) => window.__polish.listInteractive(skip),
		[...tested.focus],
	);
	const scale = await page.evaluate(() => devicePixelRatio);

	if (candidates.length > 0) {
		// keyboard modality, so that focus() shows the ring a Tab press would
		await page.keyboard.press("Tab");

		for (const candidate of candidates.slice(0, options.focusPerPage)) {
			const position = await reveal(page, candidate.nodeId);
			// under something else (a sticky bar): the Tab walk below reports that
			if (!position?.reachable) continue;
			// nowhere to park the focus: the picture "at rest" would show the candidate focused
			if (!(await page.evaluate(() => window.__polish.focusSink()))) continue;
			const clip = wholePixels(padded(position.rect, page.viewportSize(), 10));
			const rest = await shotBase64(page, clip);
			const isFocused = await evaluate(
				page,
				(id) => window.__polish.focusNode(id),
				candidate.nodeId,
			);
			// not focusable: a label, an item of a roving tabindex
			if (!isFocused) continue;
			tested.focus.add(candidate.sig);
			await page.waitForTimeout(120);
			const outline = await evaluate(
				page,
				(id) => window.__polish.outlineOf(id),
				candidate.nodeId,
			);
			const lit = await shotBase64(page, clip);
			if (!rest || !lit || !outline) {
				await page.evaluate(() => window.__polish.focusSink());
				continue;
			}
			const diff = await evaluate(
				page,
				([a, b, ratio]) => window.__polish.diffImages(a, b, ratio),
				[rest, lit, scale],
			);

			if (diff && diff.count === 0) {
				await recorder.record(
					page,
					{
						...candidate,
						rule: "no-focus-indicator",
						detail: "keyboard focus lands here and not one pixel changes",
						markGrow: 14,
					},
					context,
				);
			} else if (
				diff?.box &&
				outline.style !== "none" &&
				outline.offset >= 0 &&
				// a ring that reaches at least 2px out of the box: a thinner one can vanish into a blended pixel
				outline.width + outline.offset >= 2
			) {
				const missing = missingSides(diff.box, position.rect, clip);
				if (missing.length > 0 && missing.length < 4) {
					await recorder.record(
						page,
						{
							...candidate,
							rule: "focus-ring-clipped",
							detail: `its focus ring (a ${outline.width}px outline, ${outline.offset}px away) does not show on the ${missing.join(" and ")} side: a box around it cuts it off`,
							markGrow: 14,
						},
						context,
					);
				}
			}
			await page.evaluate(() => window.__polish.focusSink());
		}
	}

	await page.evaluate(() => {
		window.__polish.clearMarks();
		scrollTo({ top: 0, behavior: "instant" });
		window.__polish.focusStart();
	});
	let previous = null;
	for (let stop = 0; stop < options.tabStops; stop++) {
		await page.keyboard.press("Tab");
		const state = await page
			.evaluate(() => window.__polish.focusState())
			.catch(() => null);
		// focus left the page, or stays where it was
		if (!state || state.nodeId === previous) break;
		previous = state.nodeId;
		if (tested.focusWalk.has(state.sig)) continue;
		tested.focusWalk.add(state.sig);

		if (!state.visible) {
			recorder.add(
				`focus-not-visible|${state.sig}|desktop`,
				{
					...state,
					rule: "focus-not-visible",
					caseId: await recorder.caseOf(page, state.nodeId),
					detail: `Tab stops on something that is not shown (stop ${stop + 1} of the page): the keyboard user loses track of where they are`,
				},
				context,
			);
		} else if (state.obscuredBy) {
			await recorder.record(
				page,
				{
					...state,
					rule: "focus-obscured",
					detail: `Tab stops on this while it is under ${state.obscuredBy}: the focused control can't be seen`,
				},
				context,
			);
		}
	}
	await page.evaluate(() => {
		document.activeElement?.blur?.();
		window.__polish.clearMarks();
	});
}

/** The sides of the element on which the focused picture shows nothing new outside its box. */
function missingSides(diffBox, rect, clip) {
	const box = {
		left: rect.x - clip.x,
		top: rect.y - clip.y,
		right: rect.x - clip.x + rect.width,
		bottom: rect.y - clip.y + rect.height,
	};
	const sides = [];
	// only where the picture has room for a ring: at the edge of the viewport there is none to see
	if (box.left >= 3 && diffBox.left > box.left - 0.75) sides.push("left");
	if (box.top >= 3 && diffBox.top > box.top - 0.75) sides.push("top");
	if (clip.width - box.right >= 3 && diffBox.right < box.right + 0.75)
		sides.push("right");
	if (clip.height - box.bottom >= 3 && diffBox.bottom < box.bottom + 0.75)
		sides.push("bottom");
	return sides;
}

// -------------------------------------------------------------------- actions

/** Once per control, route and layout. What sits outside the page's own content (header, navigation, footer) is the same on every route. */
function actionKey(action, ctx) {
	return `${action.key}@${action.inShell ? "shell" : ctx.entry.route}@${viewportClassOf(VIEWPORTS[ctx.viewportName].viewport.width)}`;
}

/** Tabs, disclosures and in-section links clicked: what moved, did the page scroll. */
export async function actionsPass(page, ctx) {
	const { tested, options, entry } = ctx;
	const context = contextOf(ctx);
	const listed = await page.evaluate(() => window.__polish.listActions([]));
	const todo = listed
		.filter((action) => !tested.actions.has(actionKey(action, ctx)))
		.slice(0, options.actionsPerPage);

	for (const [index, planned] of todo.entries()) {
		tested.actions.add(actionKey(planned, ctx));
		if (index > 0) {
			const status = await visit(page, entry.url).catch(() => 0);
			if (status >= 400 || status === 0) return;
		}
		const fresh = await page.evaluate(() => window.__polish.listActions([]));
		const action = fresh.find((candidate) => candidate.key === planned.key);
		if (!action) continue;
		const measured = await clickAndMeasure(page, ctx, context, action);
		if (!measured) continue;
		await recordMotion(page, ctx, context, action, measured);
	}
}

/**
 * Everything else that can be clicked, in a session that lets no write through: buttons, switches,
 * checkboxes, whatever opens a dialog, popover or menu. What a click moved is recorded as for the
 * other actions, an overlay it opened is put through the probes while open, and a page it changed
 * (a section shown, validation messages) is looked at again.
 */
export async function explorePass(page, ctx) {
	const { recorder, tested, options, entry, viewportName } = ctx;
	const context = contextOf(ctx);
	const session = page.context();
	const startPath = new URL(page.url()).pathname;

	const listed = await page.evaluate(() => window.__polish.listButtons([]));
	const todo = listed
		.filter((action) => !tested.actions.has(actionKey(action, ctx)))
		.slice(0, options.explorePerPage);
	if (todo.length === 0) return;

	// what the page shows before any click is the static pass's to report
	const baseline = new Set(
		(await run(page, STATE_PROBES)).map((item) => `${item.rule}|${item.sig}`),
	);
	const overlayProbes = [
		...OVERLAY_PROBES,
		...(isTouchViewport(viewportName) ? ["tap-targets"] : []),
	];

	let needsVisit = false;
	for (const planned of todo) {
		tested.actions.add(actionKey(planned, ctx));
		if (needsVisit) {
			const status = await visit(page, entry.url).catch(() => 0);
			if (status >= 400 || status === 0) return;
			needsVisit = false;
		}
		const fresh = await page.evaluate(() => window.__polish.listButtons([]));
		const action = fresh.find((candidate) => candidate.key === planned.key);
		if (!action) continue;

		const stampBefore = await page.evaluate(() => window.__polish.stateStamp());
		const writesBefore = writesBlocked(session).length;
		const measured = await clickAndMeasure(page, ctx, context, action);
		if (!measured) continue;
		recorder.count("explored");

		for (const extra of session.pages()) {
			if (extra !== page) await extra.close().catch(() => {});
		}
		const wrote = writesBlocked(session).length > writesBefore;
		const left = new URL(page.url()).pathname !== startPath;
		if (wrote || left) {
			// a write that was cut off leaves the page in a state nobody will see, a navigation is another page's business
			recorder.count(wrote ? "writesBlocked" : "exploredAway");
			discard(measured);
			needsVisit = true;
			continue;
		}

		const name = action.text.slice(0, 40);
		const steps = [`click:${stepSelector(action)}`];
		const overlays = await page
			.evaluate(() => window.__polish.newOverlays())
			.catch(() => []);
		// a submit is expected to push the form about with its messages
		if (action.kind === "submit") discard(measured);
		else await recordMotion(page, ctx, context, action, measured);

		for (const overlay of overlays) {
			const inOverlay = {
				...context,
				state: `in the ${overlay.kind} opened by "${name}"`,
				steps,
			};
			recorder.count("overlaysOpened");
			await recorder.recordAll(
				page,
				await page.evaluate(
					([names, scope]) => window.__polish.run(names, { scope }),
					[overlayProbes, overlay.nodeId],
				),
				inOverlay,
			);
			await recorder.recordAll(
				page,
				await page.evaluate(
					(id) => window.__polish.probeOverlay(id),
					overlay.nodeId,
				),
				inOverlay,
			);
		}

		const stampAfter = await page.evaluate(() => window.__polish.stateStamp());
		if (overlays.length === 0 && stampAfter !== stampBefore) {
			recorder.count("statesChanged");
			const changed = (await run(page, STATE_PROBES)).filter(
				(item) => !baseline.has(`${item.rule}|${item.sig}`),
			);
			await recorder.recordAll(page, changed, {
				...context,
				state: `after clicking "${name}"`,
				steps,
			});
		}

		if (overlays.length > 0) {
			await page.keyboard.press("Escape");
			await settle(page, { quiet: 200 });
		}
		const stampRestored = await page
			.evaluate(() => window.__polish.stateStamp())
			.catch(() => null);
		if (stampRestored !== stampBefore) needsVisit = true;
	}
}

/** A selector `shoot.mjs --do=click:` finds the control by again. */
function stepSelector(action) {
	// ids React makes up (`:r1:`) are not valid in a selector and differ per render
	const css = action.selector.replace(/#[^.[\s>]+/g, "");
	const name = action.text.slice(0, 40).replace(/["\\]/g, "");
	return name && !name.endsWith("...") ? `${css}:has-text("${name}")` : css;
}

/**
 * Clicks the control (by coordinates, after remembering where everything is) and says what happened
 * to the layout. Null when the control can't be reached. Leaves a "before" screenshot behind for
 * `recordMotion` or `discard`.
 */
async function clickAndMeasure(page, ctx, context, action) {
	let position = await reveal(page, action.nodeId);
	if (!position?.reachable) return null;
	if (position.scrolled) {
		// a header that hides while scrolling has to finish moving before the "before" is taken
		await page.waitForTimeout(400);
		position = await reveal(page, action.nodeId);
		if (!position?.reachable) return null;
	}

	await page.evaluate((nodeId) => {
		window.__polish.markOverlays();
		window.__polish.snapshotLayout(nodeId);
	}, action.nodeId);
	const stem = ctx.recorder.stem("action", context);
	await shootMarked(page, `${stem}-before.png`, {
		marks: [
			{
				rect: position.rect,
				color: "#0a84ff",
				label: `click: ${action.text.slice(0, 30)}`,
			},
		],
		badge: "BEFORE",
		crop: false,
	});

	await page.mouse.click(position.x, position.y);
	await settle(page, { quiet: 400 });
	await page.mouse.move(1, 1);
	const diff = await page
		.evaluate(() => window.__polish?.diffLayout?.() ?? null)
		.catch(() => null);
	return {
		stem,
		diff,
		issues: diff ? actionIssues(diff, page.viewportSize(), action.kind) : [],
		caseId: await ctx.recorder.caseOf(page, action.nodeId),
	};
}

function discard(measured) {
	fs.rmSync(`${measured.stem}-before.png`, { force: true });
}

async function recordMotion(page, ctx, context, action, measured) {
	const { recorder, entry } = ctx;
	const { stem, diff, issues } = measured;
	if (issues.length === 0) {
		discard(measured);
		return;
	}

	const marks = [];
	if (diff.controlNow) {
		marks.push({ rect: diff.controlNow, color: "#0a84ff", label: "clicked" });
	}
	for (const moved of diff.moved.slice(0, 3)) {
		marks.push({
			rect: moved.before,
			color: "#ff9f0a",
			dashed: true,
			label: "was here",
		});
		marks.push({
			rect: moved.after,
			color: "#ff2d55",
			label: `moved ${moved.dx}, ${moved.dy}px`,
		});
	}
	await shootMarked(page, `${stem}-after.png`, {
		marks,
		badge: "AFTER",
		crop: false,
	});
	let media = [`${stem}-before.png`, `${stem}-after.png`];
	try {
		makeFlickerGif(media, `${stem}.gif`);
		media = [`${stem}.gif`, ...media];
	} catch {
		// the stills are enough
	}

	for (const issue of issues) {
		const layout = viewportClassOf(page.viewportSize().width);
		// a part of the header or the navigation that moves when a page's control is clicked moves for
		// every such control: one finding, about what moved
		const shellMover =
			issue.rule === "shift-on-action" && !action.inShell
				? diff.moved.find((moved) => moved.inShell)
				: null;
		recorder.add(
			shellMover && shellMover === diff.moved[0]
				? `shift-on-action|moved:${shellMover.sig}|${layout}`
				: `${issue.rule}|${action.key}|${action.inShell ? "shell" : entry.route}|${layout}`,
			{
				rule: issue.rule,
				selector: action.selector,
				sig: action.key,
				text: action.text,
				caseId: measured.caseId,
				detail: `after clicking "${action.text}" (${action.kind}${action.target ? ` to ${action.target}` : ""}): ${issue.detail}`,
				media: media.map((file) => recorder.relative(file)),
			},
			{ ...context, steps: [`click:${stepSelector(action)}`] },
		);
	}
}

function actionIssues(diff, viewport, kind) {
	const maxScrollAfter = Math.max(0, diff.pageHeightAfter - viewport.height);
	const scrolledBy = diff.scrollAfter - diff.scrollBefore;

	// a page that was scrolled sideways (it overflows, reported as horizontal-scroll) snaps back on navigation, moving everything
	if (diff.scrollXBefore !== 0 || diff.scrollXAfter !== 0) return [];

	// the next view is shorter than where the page was scrolled to: the browser had nowhere else to go
	if (scrolledBy < -2 && Math.abs(diff.scrollAfter - maxScrollAfter) < 3) {
		return [];
	}
	if (diff.scrollBefore > 60 && scrolledBy < -40) {
		return [
			{
				rule: "scroll-jump",
				detail: `the page scrolled from ${Math.round(diff.scrollBefore)}px to ${Math.round(diff.scrollAfter)}px${diff.scrollAfter < 5 ? " (back to the top)" : ""}`,
			},
		];
	}

	const issues = [];
	const scrollNote =
		Math.abs(scrolledBy) > 2
			? ` (the page scrolled by ${Math.round(scrolledBy)}px on its own)`
			: "";
	// a control that is gone or hidden was replaced by the next view, which is not a move
	const controlStillShown =
		diff.controlNow && diff.controlNow.width > 1 && diff.controlNow.height > 1;
	if (diff.controlConnected && diff.controlMoved && controlStillShown) {
		const { dx, dy } = diff.controlMoved;
		// a button under the list it adds to (or removes from) goes where the list's end goes, and one
		// that jumps to a section scrolls the page: both are what the button is for. A tab or a link has no such excuse
		const grewBy = diff.pageHeightAfter - diff.pageHeightBefore;
		const isExplained =
			["button", "submit"].includes(kind) &&
			Math.abs(dx) <= 2 &&
			(Math.abs(scrolledBy) > 2 ||
				(Math.abs(grewBy) > 2 && Math.abs(dy - grewBy) <= 4));
		if (!isExplained && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
			issues.push({
				rule: "control-moved",
				detail: `the clicked control moved ${Math.round(dx)}px sideways, ${Math.round(dy)}px down from under the pointer${scrollNote}`,
			});
		}
	}
	if (diff.moved.length > 0) {
		const biggest = diff.moved[0];
		const gutter =
			diff.viewportWidthBefore !== diff.viewportWidthAfter
				? ` (a scrollbar ${diff.viewportWidthAfter < diff.viewportWidthBefore ? "appeared" : "disappeared"}: content width ${diff.viewportWidthBefore}px -> ${diff.viewportWidthAfter}px)`
				: "";
		issues.push({
			rule: "shift-on-action",
			detail: `${diff.movedCount} element(s) ${biggest.where} the control moved, e.g. ${biggest.selector} by ${biggest.dx}, ${biggest.dy}px${gutter}${scrollNote}`,
		});
	}
	return issues;
}

// --------------------------------------------------------------------- widths

/**
 * The page at every width of `options.widths`, without reloading: what overflows, wraps or gets
 * squashed between the fixed viewports, where layouts switch. Findings carry the widths they were
 * seen at.
 */
export async function widthsPass(page, ctx) {
	const { recorder, options } = ctx;
	const original = page.viewportSize();
	for (const width of options.widths) {
		await page.setViewportSize({ width, height: original.height });
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		// layouts decided in JS follow a resize a moment later
		await page.waitForTimeout(180);
		await recorder.recordAll(
			page,
			await run(page, WIDTH_PROBES),
			contextOf(ctx, {
				viewportName: `${width}x${original.height}`,
				viewportClass: viewportClassOf(width),
				width,
			}),
		);
	}
	await page.setViewportSize(original);
}

// ----------------------------------------------------------------------- load

/**
 * One page loaded on a throttled connection, twice: with nothing cached (a first visit: fonts,
 * styles and pictures all arrive late) and with a warm cache. Then left alone for a moment and
 * scrolled to its end, for what moves without anyone asking: timers, late content, lazy pictures.
 * A finding is the component that moved (up to three per page), so a header that shifts on every
 * page is one finding. `session` records video, the evidence of a load shift is cut from it.
 */
export async function loadPass(session, ctx) {
	const { recorder, entry, viewportName, options } = ctx;
	const context = contextOf(ctx);
	const layout = viewportClassOf(VIEWPORTS[viewportName].viewport.width);
	const videoStartedAt = Date.now();
	const page = await session.newPage();
	let clip = null;

	try {
		const cdp = await session.newCDPSession(page);
		await cdp.send("Network.enable");
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: 40,
			downloadThroughput: (6 * 1024 * 1024) / 8,
			uploadThroughput: (1024 * 1024) / 8,
		});
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: 2 });

		const load = async () => {
			const status = await visit(page, entry.url);
			if (status >= 400 || status === 0) return null;
			await page.waitForTimeout(1200);
			const measured = await page.evaluate(() => ({
				origin: performance.timeOrigin,
				settledAt: performance.now(),
				shifts: window.__polish.shifts(),
			}));
			return {
				...measured,
				movers: moversOf(
					measured.shifts.filter((shift) => !shift.fontSwap),
					options.minShiftPx,
				),
			};
		};

		await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
		const cold = await load();
		if (!cold) return;

		await recordFontSwap(page, ctx, context, layout, cold.shifts);

		// pictures of what is new now: the page is about to be scrolled and loaded again
		const shots = new Map();
		for (const mover of cold.movers) {
			const key = `shift-on-load|${mover.source.sig}|${layout}`;
			if (recorder.findings.has(key) || !recorder.takeEvidence("shift-on-load"))
				continue;
			const stem = recorder.stem("load", context);
			await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
			await shootMarked(page, `${stem}.png`, {
				marks: movedMarks(mover),
				crop: false,
			});
			shots.set(key, stem);
			clip ??= {
				stem,
				key,
				from: Math.max(
					0,
					(cold.origin + mover.shift.time - videoStartedAt) / 1000 - 0.7,
				),
			};
		}

		// left alone: whatever moves now moves under someone reading
		await page.waitForTimeout(options.idleMs);
		const idle = moversOf(
			(await shiftsOf(page)).filter((shift) => shift.time > cold.settledAt),
			options.minShiftPx,
		);
		await recordLateShifts(page, ctx, context, {
			rule: "shift-on-idle",
			layout,
			movers: idle,
			when: (mover) =>
				`${Math.round((mover.shift.time - cold.settledAt) / 100) / 10}s after the page had settled, with nobody touching it`,
		});

		await page.evaluate(() => window.__polish.clearShifts());
		for (let step = 0; step < options.scrollSteps; step++) {
			const scrolled = await page.evaluate(() => {
				const before = scrollY;
				scrollBy({ top: innerHeight * 0.85, behavior: "instant" });
				return scrollY - before;
			});
			if (scrolled < 4) break;
			await page.waitForTimeout(350);
			const movers = moversOf(await shiftsOf(page), options.minShiftPx);
			if (movers.length === 0) continue;
			await recordLateShifts(page, ctx, context, {
				rule: "shift-on-scroll",
				layout,
				movers,
				when: () =>
					`while the page was being scrolled down (${step + 1} screen${step === 0 ? "" : "s"} in): what was being read moved`,
			});
			break;
		}

		await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
		const warm = await load();
		const warmSignatures = new Set(
			(warm?.movers ?? []).map((mover) => mover.source.sig),
		);
		const coldSignatures = new Set(
			cold.movers.map((mover) => mover.source.sig),
		);
		for (const mover of [
			...cold.movers,
			...(warm?.movers ?? []).filter(
				(warmOnly) => !coldSignatures.has(warmOnly.source.sig),
			),
		]) {
			const { source } = mover;
			const key = `shift-on-load|${source.sig}|${layout}`;
			const cache = !warm
				? ""
				: !coldSignatures.has(source.sig)
					? "; only on a load with a warm cache"
					: warmSignatures.has(source.sig)
						? "; on a first visit and with a warm cache alike"
						: "; only on a first visit, with nothing cached (fonts, styles or pictures arriving late)";
			const stem = shots.get(key);
			const finding = recorder.add(
				key,
				{
					rule: "shift-on-load",
					selector: source.selector,
					sig: source.sig,
					text: source.text,
					caseId: await recorder.caseOf(page, source.nodeId),
					detail: `${describeMove(mover, "while the page loaded")}${cache}`,
					media: stem ? [recorder.relative(`${stem}.png`)] : [],
				},
				context,
			);
			if (clip?.key === key) clip.finding = finding;
		}
	} catch (error) {
		recorder.count("loadErrors");
		ctx.log?.(`load ${entry.url}: ${String(error.message).split("\n")[0]}`);
	}

	const video = page.video();
	await page.close().catch(() => {});
	if (!video) return;
	const videoPath = `${clip?.stem ?? recorder.stem("video", context)}.webm`;
	try {
		if (clip?.finding) {
			await video.saveAs(videoPath);
			videoToGif(videoPath, `${clip.stem}.gif`, {
				from: clip.from,
				duration: 3.5,
				slowdown: 4,
				width: layout === "mobile" ? 375 : 800,
			});
			clip.finding.media.unshift(recorder.relative(`${clip.stem}.gif`));
		}
	} catch {
		// the still is enough
	}
	await video.delete().catch(() => {});
	fs.rmSync(videoPath, { force: true });
}

/**
 * What moves when the web font arrives is one finding for the whole site: the cause is the font (text
 * first drawn in a fallback of other widths), whichever component happens to show it on a page.
 */
async function recordFontSwap(page, ctx, context, layout, shifts) {
	const { recorder, options } = ctx;
	const [mover] = moversOf(
		shifts.filter((shift) => shift.fontSwap),
		options.minShiftPx,
	);
	if (!mover) return;
	const key = `shift-on-load|font-swap|${layout}`;
	const media = [];
	if (!recorder.findings.has(key) && recorder.takeEvidence("shift-on-load")) {
		const file = `${recorder.stem("font-swap", context)}.png`;
		await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
		await shootMarked(page, file, { marks: movedMarks(mover), crop: false });
		media.push(recorder.relative(file));
	}
	recorder.add(
		key,
		{
			rule: "shift-on-load",
			selector: mover.source.selector,
			sig: "font-swap",
			component: mover.source.sig,
			text: mover.source.text,
			caseId: await recorder.caseOf(page, mover.source.nodeId),
			detail: `the page shifts when the web font arrives on a first visit: text is drawn in the fallback font first, which has other widths. Here ${describeMove(mover, "at that moment")}. A fallback with matched metrics (size-adjust) or a preloaded font stops it everywhere; the components seen moving are listed with the finding`,
			media,
		},
		context,
	);
}

function shiftsOf(page) {
	return page.evaluate(() => window.__polish.shifts());
}

async function recordLateShifts(
	page,
	ctx,
	context,
	{ rule, layout, movers, when },
) {
	const { recorder } = ctx;
	for (const mover of movers) {
		const { source } = mover;
		const key = `${rule}|${source.sig}|${layout}`;
		const media = [];
		if (!recorder.findings.has(key) && recorder.takeEvidence(rule)) {
			const file = `${recorder.stem(rule, context)}.png`;
			await shootMarked(page, file, { marks: movedMarks(mover), crop: false });
			media.push(recorder.relative(file));
		}
		recorder.add(
			key,
			{
				rule,
				selector: source.selector,
				sig: source.sig,
				text: source.text,
				caseId: await recorder.caseOf(page, source.nodeId),
				detail: describeMove(mover, when(mover)),
				media,
			},
			context,
		);
	}
}

function distance(source) {
	return Math.max(
		Math.abs(source.current.x - source.previous.x),
		Math.abs(source.current.y - source.previous.y),
	);
}

/**
 * The components that moved, furthest first, three at most: `{ source, shift, moved, count }`. A box
 * that only appeared (it had no size before) did not move, and what sits inside another mover moved
 * with it.
 */
function moversOf(shifts, minPx) {
	const bySignature = new Map();
	for (const shift of shifts) {
		if (shift.hadRecentInput) continue;
		// one shift is one thing happening: its furthest mover (the biggest among equals) stands for it
		let top = null;
		for (const source of shift.sources) {
			if (source.inner) continue;
			const hadSize = source.previous.width > 0 && source.previous.height > 0;
			const hasSize = source.current.width > 0 && source.current.height > 0;
			if (!hadSize || !hasSize) continue;
			const moved = distance(source);
			if (moved < minPx) continue;
			const area = source.current.width * source.current.height;
			if (
				!top ||
				moved > top.moved + 0.5 ||
				(Math.abs(moved - top.moved) <= 0.5 && area > top.area)
			) {
				top = { source, moved, area };
			}
		}
		if (!top) continue;
		const best = bySignature.get(top.source.sig);
		if (!best || top.moved > best.moved) {
			bySignature.set(top.source.sig, {
				source: top.source,
				shift,
				moved: top.moved,
				count: (best?.count ?? 0) + 1,
			});
		} else {
			best.count++;
		}
	}
	return [...bySignature.values()]
		.sort(
			(a, b) =>
				b.moved - a.moved ||
				b.source.current.width * b.source.current.height -
					a.source.current.width * a.source.current.height,
		)
		.slice(0, 3);
}

function movedMarks({ source }) {
	return [
		{
			rect: source.previous,
			color: "#ff9f0a",
			dashed: true,
			label: "was here",
		},
		{ rect: source.current, color: "#ff2d55", label: "ended up here" },
	];
}

function describeMove({ source, shift, moved, count }, when) {
	const dx = Math.round(source.current.x - source.previous.x);
	const dy = Math.round(source.current.y - source.previous.y);
	return `${source.selector} moved ${Math.round(moved)}px (${dx} across, ${dy} down) ${when}, ${Math.round(shift.time)}ms in${count > 1 ? `, ${count} times` : ""}: from x=${Math.round(source.previous.x)}, y=${Math.round(source.previous.y)} (${Math.round(source.previous.width)}x${Math.round(source.previous.height)}) to x=${Math.round(source.current.x)}, y=${Math.round(source.current.y)} (${Math.round(source.current.width)}x${Math.round(source.current.height)})`;
}

// ------------------------------------------------------------------- plumbing

function run(page, probes) {
	return page.evaluate((names) => window.__polish.run(names), probes);
}

function evaluate(page, pageFunction, argument) {
	return page.evaluate(pageFunction, argument).catch(() => null);
}

function reveal(page, nodeId) {
	return page
		.evaluate((id) => window.__polish.reveal(id), nodeId)
		.catch(() => null);
}

function snapshot(page, nodeId) {
	return page
		.evaluate((id) => window.__polish.styleSnapshot(id), nodeId)
		.catch(() => null);
}

function padded(rect, viewport, pad = 6) {
	const x = Math.max(0, rect.x - pad);
	const y = Math.max(0, rect.y - pad);
	return {
		x,
		y,
		width: Math.max(1, Math.min(viewport.width, rect.x + rect.width + pad) - x),
		height: Math.max(
			1,
			Math.min(viewport.height, rect.y + rect.height + pad) - y,
		),
	};
}

/** The rect grown to whole pixels, the way a screenshot clips. */
function wholePixels(rect) {
	const x = Math.floor(rect.x);
	const y = Math.floor(rect.y);
	return {
		x,
		y,
		width: Math.ceil(rect.x + rect.width) - x,
		height: Math.ceil(rect.y + rect.height) - y,
	};
}

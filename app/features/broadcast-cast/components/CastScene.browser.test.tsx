import { beforeAll, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { BroadcastOverlay } from "~/features/broadcast/components/BroadcastOverlay";
import { CALENDAR_EVENT } from "~/features/calendar/calendar-constants";
import { TEAM } from "~/features/team/team-constants";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { USER } from "~/features/user-page/user-page-constants";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DESIGN_BRACKETS,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_SCENES,
	DEFAULT_CAST_BROADCAST_SETTINGS,
} from "../broadcast-cast-constants";
import type { CastBroadcastState } from "../broadcast-cast-types";
import * as DesignScenario from "../core/DesignScenario";
import { CAST_SCENE_SET } from "./CastScene";

import "~/styles/fonts.css";

const SCENARIO: DesignScenario.Scenario = {
	scene: "game",
	transition: "stinger",
	names: "long",
	set: "decider",
	bestOf: 7,
	ink: null,
	swapSides: false,
	seeds: true,
	logos: true,
	placeholderLogos: false,
	players: 4,
	casters: 3,
	otherMatches: 8,
	headline: true,
	bracket: "double_elimination",
	bracketFocus: "remaining",
};

const IMAGE_URL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="teal"/></svg>')}`;

const VARIANTS = {
	"long names": (state) => state,
	"the longest names": withLongestTexts,
	"no logos or avatars": withoutImages,
	"a team TBD": (state) => withTeams(state, [state.match!.teams[0], null]),
	"both teams TBD": (state) => withTeams(state, [null, null]),
} satisfies Record<string, (state: CastBroadcastState) => CastBroadcastState>;

const SCENE_CASES = BROADCAST_SCENES.flatMap((scene) =>
	Object.keys(VARIANTS).map((variant) => ({
		scene,
		variant: variant as keyof typeof VARIANTS,
	})),
);

const BRACKET_CASES = BROADCAST_DESIGN_BRACKETS.flatMap((bracket) =>
	BROADCAST_BRACKET_FOCUSES.filter(
		(focus) =>
			bracket === "double_elimination" ||
			focus === "remaining" ||
			focus === "whole",
	).flatMap((bracketFocus) =>
		(["long names", "the longest names"] as const).map((variant) => ({
			bracket,
			bracketFocus,
			variant,
		})),
	),
);

// glyphs and subpixel layout poke out a little without anything looking off
const TOLERANCE_PX = 2;

beforeAll(async () => {
	await page.viewport(1920, 1080);
	await document.fonts.load("700 16px lexend", "Aa");
});

describe("CastScene", () => {
	test.each(SCENE_CASES)(
		"fits $scene with $variant",
		async ({ scene, variant }) => {
			const state = VARIANTS[variant](stateOf({ ...SCENARIO, scene }));

			expect(await overflowsOnAir(state)).toEqual([]);
		},
	);

	test.each(BRACKET_CASES)(
		"fits the $bracket bracket, $bracketFocus, with $variant",
		async ({ bracket, bracketFocus, variant }) => {
			const state = VARIANTS[variant](
				stateOf({ ...SCENARIO, scene: "bracket", bracket, bracketFocus }),
			);

			expect(await overflowsOnAir(state)).toEqual([]);
		},
	);

	test.each(["long names", "the longest names"] as const)(
		"fits the results of a game the scanner didn't read with %s",
		async (variant) => {
			const state = VARIANTS[variant](
				stateOf({ ...SCENARIO, scene: "results" }),
			);

			expect(await overflowsOnAir({ ...state, scannedGame: null })).toEqual([]);
		},
	);

	test.each(Object.keys(VARIANTS) as Array<keyof typeof VARIANTS>)(
		"fits the stinger with %s",
		async (variant) => {
			const state = VARIANTS[variant](stateOf({ ...SCENARIO, scene: "game" }));

			expect(await overflowsOfStinger(state)).toEqual([]);
		},
	);

	test("fits the stinger's title card without a match", async () => {
		const state = withLongestTexts(stateOf({ ...SCENARIO, scene: "casters" }));

		expect(await overflowsOfStinger({ ...state, match: null })).toEqual([]);
	});

	test("reports a name cut off without an ellipsis", async () => {
		const state = stateOf({ ...SCENARIO, scene: "rosters" });

		const problems = await overflowsOnAir({
			...state,
			settings: {
				...state.settings,
				css: '[data-scene="rosters"] [data-part="team-name"] { text-overflow: clip; }',
			},
		});

		expect(problems).toContainEqual(
			expect.stringContaining("cut off sideways"),
		);
	});

	test("reports a name sticking out of its box", async () => {
		const state = stateOf({ ...SCENARIO, scene: "rosters" });

		const problems = await overflowsOnAir({
			...state,
			settings: {
				...state.settings,
				css: '[data-scene="rosters"] [data-part="team-name"] { overflow: visible; }',
			},
		});

		expect(problems).toContainEqual(expect.stringContaining("sticks out"));
	});
});

function stateOf(scenario: DesignScenario.Scenario): CastBroadcastState {
	const state = DesignScenario.build({
		scenario,
		tournament: { name: "In The Zone 50", logoUrl: IMAGE_URL },
		settings: {
			...DEFAULT_CAST_BROADCAST_SETTINGS,
			headline: "Top 8 starts at 18:00 CEST",
		},
		takenAt: Date.now(),
	});

	// the mock's own images are on the CDN, a data URL keeps the layout the same without the network
	return JSON.parse(JSON.stringify(state), (key, value) =>
		(key === "avatarUrl" || key === "logoUrl") && value ? IMAGE_URL : value,
	);
}

/** Every name as long as it can be, unbroken by spaces where a name can be one word. */
function withLongestTexts(state: CastBroadcastState): CastBroadcastState {
	const longest = JSON.parse(
		JSON.stringify(state),
		function (this: Record<string, unknown>, key, value) {
			if (key !== "name") return value;
			if ("seed" in this) return "W".repeat(TEAM.NAME_MAX_LENGTH);
			if ("weapons" in this || "pronouns" in this) {
				return "W".repeat(USER.CUSTOM_NAME_MAX_LENGTH);
			}

			return value;
		},
	) as CastBroadcastState;

	return {
		...longest,
		tournament: {
			...longest.tournament,
			name: wordsOfLength(CALENDAR_EVENT.NAME_MAX_LENGTH),
		},
		settings: {
			...longest.settings,
			headline: wordsOfLength(BROADCAST_HEADLINE_MAX_LENGTH),
		},
		casters: longest.casters.map((caster) => ({
			...caster,
			pronouns: { subject: "they", object: "them" },
		})),
		match: longest.match
			? {
					...longest.match,
					bracketName: "W".repeat(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				}
			: null,
	};
}

function wordsOfLength(length: number) {
	return "Wide ".repeat(length).slice(0, length).trim();
}

function withoutImages(state: CastBroadcastState): CastBroadcastState {
	return JSON.parse(
		JSON.stringify(state),
		function (this: Record<string, unknown>, key, value) {
			const isTeam = "seed" in this;

			return key === "avatarUrl" || (key === "logoUrl" && isTeam)
				? null
				: value;
		},
	);
}

function withTeams(
	state: CastBroadcastState,
	teams: NonNullable<CastBroadcastState["match"]>["teams"],
): CastBroadcastState {
	return { ...state, match: state.match ? { ...state.match, teams } : null };
}

async function overflowsOnAir(state: CastBroadcastState) {
	await render(
		<BroadcastOverlay sceneSet={CAST_SCENE_SET} state={state} view="live" />,
	);
	const marquees = await settle();

	return overflows({ root: canvas(), marquees });
}

/** Overflows of the stinger's card while it covers the screen, as a stinger Take plays. */
async function overflowsOfStinger(state: CastBroadcastState) {
	const screen = await render(
		<BroadcastOverlay sceneSet={CAST_SCENE_SET} state={state} view="live" />,
	);
	await screen.rerender(
		<BroadcastOverlay
			sceneSet={CAST_SCENE_SET}
			state={{ ...state, takeId: state.takeId + 1 }}
			view="live"
		/>,
	);
	await document.fonts.ready;

	const stinger = canvas().querySelector<HTMLElement>('[data-part="stinger"]')!;
	const stingerDurationMs = Number.parseFloat(
		getComputedStyle(stinger).getPropertyValue("--bc-stinger-duration"),
	);
	for (const animation of stinger.getAnimations({ subtree: true })) {
		animation.pause();
		// halfway through, between covering the screen and starting to reveal the new scene
		animation.currentTime = stingerDurationMs / 2;
	}
	await nextFrame();

	return overflows({ root: stinger, marquees: new Set() });
}

function canvas() {
	return document.querySelector<HTMLElement>("[data-broadcast]")!;
}

/** Plays the entrance animations to their end and stops the looping ones, returning what the looping ones moved. */
async function settle() {
	await document.fonts.ready;
	await nextFrame();
	await nextFrame();

	const marquees = new Set<Element>();
	for (const animation of document.getAnimations()) {
		const effect = animation.effect as KeyframeEffect | null;
		if (effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY) {
			if (effect.target) marquees.add(effect.target);
			animation.cancel();
		} else {
			animation.finish();
		}
	}
	await nextFrame();

	return marquees;
}

function nextFrame() {
	return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Texts of the root sticking out of their boxes or cut off by an ancestor up to the canvas. Unless on purpose: an
 * ellipsis, a line clamp, positioned out of the box, or moved by a transform (a camera) or a looping animation (a
 * marquee scrolling by).
 */
function overflows({
	root,
	marquees,
}: {
	root: HTMLElement;
	marquees: Set<Element>;
}) {
	const problems: string[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent?.trim();
		const parent = node.parentElement!;
		if (!text || !isVisible(parent)) continue;

		const range = document.createRange();
		range.selectNodeContents(node);
		const lines = Array.from(range.getClientRects());
		if (lines.length === 0) continue;

		const lineHeight = Number.parseFloat(getComputedStyle(parent).lineHeight);
		// a line's rect spans the font's ascent and descent, which a tight line height doesn't leave room for
		const halfLeading = Number.isNaN(lineHeight)
			? 0
			: Math.max(0, (lines[0].height - lineHeight) / 2);
		let shown = {
			left: Math.min(...lines.map((line) => line.left)),
			right: Math.max(...lines.map((line) => line.right)),
			top: Math.min(...lines.map((line) => line.top)) + halfLeading,
			bottom: Math.max(...lines.map((line) => line.bottom)) - halfLeading,
		};
		let isPositioned = false;
		let isMoved = false;

		for (
			let element: HTMLElement | null = parent;
			element;
			element = element.parentElement
		) {
			const style = getComputedStyle(element);
			const box = element.getBoundingClientRect();
			const isCanvas = element.hasAttribute("data-broadcast");
			// `overflow: clip` can leave room for e.g. descenders past a tight line height
			const tolerance =
				TOLERANCE_PX + (Number.parseFloat(style.overflowClipMargin) || 0);
			const sticksOutSideways =
				shown.left < box.left - tolerance ||
				shown.right > box.right + tolerance;
			const sticksOutVertically =
				shown.top < box.top - tolerance ||
				shown.bottom > box.bottom + tolerance;
			const hasBox = style.display !== "inline" && style.display !== "contents";

			if (hasBox && (sticksOutSideways || sticksOutVertically)) {
				const axis = sticksOutSideways ? "x" : "y";
				const clips =
					isCanvas ||
					style[axis === "x" ? "overflowX" : "overflowY"] !== "visible";
				const isOnPurpose =
					isMoved ||
					(clips
						? axis === "x"
							? style.textOverflow === "ellipsis"
							: style.webkitLineClamp !== "none"
						: isPositioned);

				if (!isOnPurpose) {
					problems.push(
						`"${text.slice(0, 40)}" (${partOf(parent)}) ${clips ? "cut off" : "sticks out"} ${axis === "x" ? "sideways" : "vertically"} by ${partOf(element)}`,
					);
					break;
				}

				shown = {
					left: Math.max(shown.left, box.left),
					right: Math.min(shown.right, box.right),
					top: Math.max(shown.top, box.top),
					bottom: Math.min(shown.bottom, box.bottom),
				};
				if (shown.left >= shown.right || shown.top >= shown.bottom) break;
			}

			if (isCanvas) break;
			if (marquees.has(element) || isTransformed(style)) isMoved = true;
			if (style.position === "absolute" || style.position === "fixed") {
				isPositioned = true;
			}
		}
	}

	return problems;
}

function isTransformed(style: CSSStyleDeclaration) {
	return (
		(style.transform !== "none" &&
			!new DOMMatrix(style.transform).isIdentity) ||
		(style.translate !== "none" && !/^0px( 0px)?$/.test(style.translate)) ||
		(style.scale !== "none" && !/^1( 1)?$/.test(style.scale))
	);
}

function isVisible(element: HTMLElement) {
	return element.checkVisibility({
		opacityProperty: true,
		visibilityProperty: true,
	});
}

function partOf(element: HTMLElement) {
	if (element.hasAttribute("data-broadcast")) return "the canvas";
	const part = element.closest("[data-part]")?.getAttribute("data-part");

	return part ? `[data-part=${part}]` : element.className;
}

import { beforeAll, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
	type BroadcastClips,
	BroadcastClipsContext,
	NO_BROADCAST_CLIPS,
} from "~/features/broadcast/broadcast-clips-context";
import { BROADCAST_MUSIC_TITLE_MAX_LENGTH } from "~/features/broadcast/broadcast-constants";
import type {
	BroadcastAudioFeed,
	BroadcastStingerVariant,
} from "~/features/broadcast/broadcast-types";
import { BroadcastOverlay } from "~/features/broadcast/components/BroadcastOverlay";
import * as MusicPlayback from "~/features/broadcast/core/MusicPlayback";
import { CALENDAR_EVENT } from "~/features/calendar/calendar-constants";
import { TEAM } from "~/features/team/team-constants";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { USER } from "~/features/user-page/user-page-constants";
import {
	BROADCAST_DESIGN_BRACKET_FOCUSES,
	BROADCAST_DESIGN_BRACKETS,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_MUSIC_SCENES,
	BROADCAST_NOW_PLAYING_MAX_LENGTH,
	BROADCAST_SCENES,
	DEFAULT_CAST_BROADCAST_SETTINGS,
} from "../broadcast-cast-constants";
import { BROADCAST_THEME_PRESETS } from "../broadcast-cast-theme-presets";
import type { CastBroadcastState, CastScene } from "../broadcast-cast-types";
import * as DesignScenario from "../core/DesignScenario";
import { CAST_SCENE_SET } from "./CastScene";

import "~/styles/fonts.css";

const SCENARIO: DesignScenario.Scenario = {
	scene: "game",
	transition: "teamsStinger",
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
	nowPlaying: "track",
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
	BROADCAST_DESIGN_BRACKET_FOCUSES.filter(
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

const PRESET_VARIANTS = ["long names", "the longest names"] as const;

const PRESET_CASES = BROADCAST_THEME_PRESETS.flatMap((preset) =>
	BROADCAST_SCENES.flatMap((scene) =>
		PRESET_VARIANTS.map((variant) => ({ preset: preset.key, scene, variant })),
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

	test.each(BROADCAST_SCENES)("fits %s with mixed names", async (scene) => {
		const state = stateOf({ ...SCENARIO, scene, names: "mixed" });

		expect(await overflowsOnAir(state)).toEqual([]);
	});

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

	test.each(BROADCAST_MUSIC_SCENES)(
		"fits the longest now playing text on %s",
		async (scene) => {
			const state = withLongestTexts(
				stateOf({ ...SCENARIO, scene, nowPlaying: "text" }),
			);

			expect(await overflowsOnAir(state)).toEqual([]);
		},
	);

	test("fits the stinger's title card without a match", async () => {
		const state = withLongestTexts(stateOf({ ...SCENARIO, scene: "casters" }));

		expect(await overflowsOfStinger({ ...state, match: null })).toEqual([]);
	});

	test.each([
		{ from: "rosters", to: "game", variant: "teams" },
		{ from: "game", to: "results", variant: "teams" },
		{ from: "results", to: "maps", variant: "tournament" },
		{ from: "bracket", to: "rosters", variant: "tournament" },
	] as const)(
		"plays the $variant stinger from $from to $to",
		async ({ from, to, variant }) => {
			await playStinger(stateOf({ ...SCENARIO, scene: to }), { from });

			expect(stingerVariantOnScreen()).toEqual({
				variant,
				hasTeams: variant === "teams",
				hasTitleCard: variant === "tournament",
			});
		},
	);

	test("plays the stinger it is given whatever the scenes", async () => {
		await playStinger(stateOf({ ...SCENARIO, scene: "game" }), {
			stinger: "tournament",
		});

		expect(stingerVariantOnScreen().variant).toBe("tournament");
	});

	test.each([
		{
			organizationName: "Sendou.ink",
			rows: ["In The Zone 50", "Sendou.ink", "In The Zone 50"],
		},
		{
			organizationName: null,
			rows: ["In The Zone 50", "In The Zone 50", "In The Zone 50"],
		},
	])(
		"alternates the tournament's name with its organization's ($organizationName) behind the tournament stinger",
		async ({ organizationName, rows }) => {
			const state = stateOf({ ...SCENARIO, scene: "results" });

			await playStinger(
				{ ...state, tournament: { ...state.tournament, organizationName } },
				{ stinger: "tournament" },
			);

			const shownRows = Array.from(
				stingerOnScreen().querySelectorAll(
					'[data-part="stinger-title-backdrop-row"]',
				),
				(row) => row.textContent?.split(" · ")[0],
			);
			expect(shownRows).toEqual(rows);
		},
	);

	test("fits the tournament stinger with the longest names", async () => {
		const state = withLongestTexts(stateOf({ ...SCENARIO, scene: "results" }));

		expect(await overflowsOfStinger(state, "tournament")).toEqual([]);
	});

	test.each(BROADCAST_THEME_PRESETS.map((preset) => preset.key))(
		"fits the tournament stinger with the longest names in the %s preset",
		async (preset) => {
			const state = withPreset(
				withLongestTexts(stateOf({ ...SCENARIO, scene: "results" })),
				preset,
			);

			expect(await overflowsOfStinger(state, "tournament")).toEqual([]);
		},
	);

	test.each(PRESET_CASES)(
		"fits $scene with $variant in the $preset preset",
		async ({ preset, scene, variant }) => {
			const state = withPreset(
				VARIANTS[variant](stateOf({ ...SCENARIO, scene })),
				preset,
			);

			expect(await overflowsOnAir(state)).toEqual([]);
		},
	);

	test.each(
		BROADCAST_THEME_PRESETS.flatMap((preset) =>
			PRESET_VARIANTS.map((variant) => ({ preset: preset.key, variant })),
		),
	)(
		"fits the stinger with $variant in the $preset preset",
		async ({ preset, variant }) => {
			const state = withPreset(
				VARIANTS[variant](stateOf({ ...SCENARIO, scene: "game" })),
				preset,
			);

			expect(await overflowsOfStinger(state)).toEqual([]);
		},
	);

	test("shows the track playing over the producer's text", async () => {
		const state = stateOf({ ...SCENARIO, scene: "break" });

		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={withNowPlayingText(state, "Back in 5")}
				view="live"
			/>,
		);

		expect(nowPlayingLine()?.getAttribute("data-source")).toBe("track");
		expect(nowPlayingPart("now-playing-title")?.textContent).toBe(
			state.music!.tracks[0].title,
		);
	});

	test("shows the producer's text while the music is paused", async () => {
		const state = stateOf({ ...SCENARIO, scene: "casters" });

		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={{
					...withNowPlayingText(state, "Back in 5"),
					music: MusicPlayback.pause(state.music!, Date.now()),
				}}
				view="live"
			/>,
		);

		expect(nowPlayingLine()?.getAttribute("data-source")).toBe("text");
		expect(nowPlayingPart("now-playing-text")?.textContent).toBe("Back in 5");
	});

	test.each([1, 2, 3])(
		"keeps the now playing line off the camera frames with %i casters",
		async (casters) => {
			await render(
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={withLongestTexts(
						stateOf({ ...SCENARIO, scene: "casters", casters }),
					)}
					view="live"
				/>,
			);
			await settle();

			const line = nowPlayingLine()!.getBoundingClientRect();
			const frames = Array.from(
				canvas().querySelectorAll(
					'[data-scene="casters"] [data-part="camera"]',
				),
				(frame) => frame.getBoundingClientRect(),
			);
			expect(frames).toHaveLength(casters);
			for (const frame of frames) {
				const overlaps =
					line.left < frame.right &&
					line.right > frame.left &&
					line.top < frame.bottom &&
					line.bottom > frame.top;
				expect(overlaps, JSON.stringify({ line, frame })).toBe(false);
			}
		},
	);

	test.each(["starting", "break", "technical", "ending"] as const)(
		"shows the now playing line in the %s scene's left column",
		async (scene) => {
			await render(
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={stateOf({ ...SCENARIO, scene })}
					view="live"
				/>,
			);

			expect(nowPlayingLine()?.closest('[data-part="content"]')).not.toBeNull();
		},
	);

	test("keeps the now playing line as the track changes, changing only its words", async () => {
		const state = stateOf({ ...SCENARIO, scene: "break" });
		const music = state.music!;
		const twoTracks = MusicPlayback.start({
			tracks: [
				music.tracks[0],
				{ ...music.tracks[0], id: "second-track", title: "Second" },
			],
			volume: music.volume,
			now: Date.now() - 5_000,
		});
		// NowPlaying's clock ticks in whole seconds, a skip between them would show only at the next tick
		const skippedAt = Math.floor(Date.now() / 1000) * 1000;
		const screen = await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={{ ...state, music: twoTracks }}
				view="live"
			/>,
		);
		const line = nowPlayingLine();

		await screen.rerender(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={{
					...state,
					music: MusicPlayback.skip(twoTracks, skippedAt, "next"),
				}}
				view="live"
			/>,
		);

		await vi.waitFor(() =>
			expect(nowPlayingPart("now-playing-title")?.textContent).toBe("Second"),
		);
		expect(nowPlayingLine()).toBe(line);
	});

	test("shows nothing of a scene it doesn't know, e.g. one a deploy added after the page loaded", async () => {
		const state = stateOf({ ...SCENARIO, scene: "break" });
		const screen = await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={{
					...state,
					live: { ...state.live, scene: "futureScene" as CastScene },
				}}
				view="live"
			/>,
		);

		expect(screen.container.querySelector('[data-part="title"]')).toBeNull();
		expect(screen.container.textContent).not.toMatch(/futureScene/i);
	});

	test("shows no now playing line without music or text", async () => {
		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={stateOf({ ...SCENARIO, scene: "break", nowPlaying: "none" })}
				view="live"
			/>,
		);

		expect(nowPlayingLine()).toBeNull();
	});

	test("shows VS between the rosters before the set started", async () => {
		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={stateOf({ ...SCENARIO, scene: "rosters", set: "start" })}
				view="live"
			/>,
		);

		expect(rostersPart("versus")?.textContent).toBe("VS");
		expect(rostersPart("score")).toBeNull();
	});

	test("shows the set score between the rosters in place of VS once the set started", async () => {
		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={stateOf({ ...SCENARIO, scene: "rosters", set: "ongoing" })}
				view="live"
			/>,
		);

		expect(rostersPart("score")?.textContent).toBe("2–1");
		expect(rostersPart("versus")).toBeNull();
	});

	test.each(["versus", "score"] as const)(
		"keeps the rosters' headers level with the %s on their line when one name wraps",
		async (middle) => {
			await render(
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={stateOf({
						...SCENARIO,
						scene: "rosters",
						names: "mixed",
						set: middle === "versus" ? "start" : "ongoing",
					})}
					view="live"
				/>,
			);
			await settle();

			const names = canvas().querySelectorAll<HTMLElement>(
				'[data-scene="rosters"] [data-part="team-name"]',
			);
			const headers = Array.from(
				canvas().querySelectorAll<HTMLElement>(
					'[data-scene="rosters"] [data-part="team-header"]',
				),
				(header) => header.getBoundingClientRect(),
			);
			const middleBox = rostersPart(middle)!.getBoundingClientRect();
			const headerBorder = Number.parseFloat(
				getComputedStyle(rostersPart("team-header")!).borderBottomWidth,
			);

			expect(names[0].getBoundingClientRect().height).toBeGreaterThan(
				names[1].getBoundingClientRect().height * 1.5,
			);
			expect(headers[0].bottom).toBeCloseTo(headers[1].bottom, 0);
			expect(middleBox.top + middleBox.height / 2).toBeCloseTo(
				headers[0].bottom - headerBorder / 2,
				0,
			);
		},
	);

	test.each([
		{ hasCounterpicks: true, label: "Counterpick" },
		{ hasCounterpicks: false, label: "To be decided" },
	])(
		"says $label on the maps scene's games whose map isn't known yet",
		async ({ hasCounterpicks, label }) => {
			const state = stateOf({ ...SCENARIO, scene: "maps", set: "ongoing" });
			const match = state.match!;
			const progress = {
				...match.progress.live,
				games: match.progress.live.games.map((game, i) =>
					i >= match.progress.live.gameNumber ? { ...game, map: null } : game,
				),
			};

			await render(
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={{
						...state,
						match: {
							...match,
							hasCounterpicks,
							progress: { live: progress, next: progress },
						},
					}}
					view="live"
				/>,
			);

			const unknown = Array.from(
				canvas().querySelectorAll('[data-part="game"][data-unknown]'),
				(game) => game.textContent?.replace(/^\d+/, ""),
			);
			expect(unknown.length).toBeGreaterThan(0);
			expect(unknown.every((text) => text === label)).toBe(true);
		},
	);

	test("colors the team swapped to the scoreboard's left, Alpha, in the ink pair's first color", async () => {
		const state = stateOf({
			...SCENARIO,
			ink: "lockYellowPurple",
			swapSides: true,
		});

		await render(
			<BroadcastOverlay sceneSet={CAST_SCENE_SET} state={state} view="live" />,
		);

		const left = canvas().querySelector<HTMLElement>(
			'[data-scene="game"] [data-part="team"][data-team="a"]',
		)!;
		expect(left.querySelector('[data-part="team-name"]')?.textContent).toBe(
			state.match!.teams[1]!.name,
		);
		expect(
			getComputedStyle(left).getPropertyValue("--team-color").toUpperCase(),
		).toBe("#F0EB24");
	});

	test("shows a placeholder in place of a caster's camera outside OBS and an audio only caster's avatar", async () => {
		await render(
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={stateOf({ ...SCENARIO, scene: "casters", casters: 2 })}
				view="live"
			/>,
		);

		const cameras = canvas().querySelectorAll('[data-part="caster-camera"]');
		expect(canvas().querySelectorAll("iframe")).toHaveLength(0);
		expect(
			cameras[0].querySelector('[data-part="caster-camera-placeholder"]'),
		).not.toBeNull();
		expect(
			cameras[1].querySelector('[data-part="caster-avatar"]'),
		).not.toBeNull();
	});

	test.each([
		{ scene: "casters", plate: "caster-name" },
		{ scene: "game", plate: "caster" },
	] as const)(
		"alternates a caster's pronouns and user page URL only when they have both in the $scene scene",
		async ({ scene, plate: platePart }) => {
			await render(
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={stateOf({ ...SCENARIO, scene, casters: 3 })}
					view="live"
				/>,
			);

			const [bothPlate, urlOnlyPlate, pronounsOnlyPlate] = Array.from(
				canvas().querySelectorAll<HTMLElement>(`[data-part="${platePart}"]`),
			).map((plate) => ({
				pronouns: plate.querySelector<HTMLElement>(
					'[data-part="caster-pronouns"]',
				),
				url: plate.querySelector<HTMLElement>('[data-part="caster-url"]'),
			}));
			const isLooping = (element: HTMLElement | null) =>
				element!
					.getAnimations()
					.some(
						(animation) =>
							animation.effect?.getComputedTiming().iterations ===
							Number.POSITIVE_INFINITY,
					);

			expect(isLooping(bothPlate.pronouns)).toBe(true);
			expect(isLooping(bothPlate.url)).toBe(true);
			expect(bothPlate.url?.textContent).toBe("/u/lean");
			expect(urlOnlyPlate.pronouns).toBeNull();
			expect(isLooping(urlOnlyPlate.url)).toBe(false);
			expect(pronounsOnlyPlate.url).toBeNull();
			expect(isLooping(pronounsOnlyPlate.pronouns)).toBe(false);
		},
	);

	test("shows the avatar of a caster without a VDO.ninja link", async () => {
		const state = stateOf({ ...SCENARIO, scene: "casters", casters: 1 });

		await render(
			<BroadcastClipsContext.Provider
				value={{
					...NO_BROADCAST_CLIPS,
					isMuted: false,
					clockOffsetMs: 0,
					reportFeeds: () => {},
				}}
			>
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={{
						...state,
						casters: state.casters.map((caster) => ({
							...caster,
							vdoNinjaUrl: null,
						})),
					}}
					view="live"
				/>
			</BroadcastClipsContext.Provider>,
		);

		expect(canvas().querySelectorAll("iframe")).toHaveLength(0);
		expect(
			canvas().querySelector('[data-part="caster-avatar"]'),
		).not.toBeNull();
	});

	test("keeps the casters' cameras on the program on another scene, out of sight", async () => {
		const state = stateOf({ ...SCENARIO, scene: "game", casters: 2 });

		await render(
			<BroadcastClipsContext.Provider
				value={{
					...NO_BROADCAST_CLIPS,
					isMuted: false,
					clockOffsetMs: 0,
					reportFeeds: () => {},
				}}
			>
				<BroadcastOverlay
					sceneSet={CAST_SCENE_SET}
					state={{
						...state,
						casters: state.casters.map((caster) => ({
							...caster,
							// a host that never resolves, so the test stays off the network
							vdoNinjaUrl: `https://vdo.invalid/?view=${caster.userId}`,
						})),
					}}
					view="live"
				/>
			</BroadcastClipsContext.Provider>,
		);

		const cameras = canvas().querySelectorAll<HTMLElement>(
			'[data-part="caster-camera"]',
		);
		expect(cameras).toHaveLength(2);
		expect(cameras[0].querySelector("iframe")?.src).toContain("view=1");
		expect(getComputedStyle(cameras[0]).visibility).toBe("hidden");
	});

	test("reports how loud each caster is and that their stream connected", async () => {
		const reports: BroadcastAudioFeed[][] = [];
		const [first] = await renderCasterCameras({
			isMuted: false,
			reportFeeds: (feeds) => reports.push(feeds),
		});

		postFromIframe(first.iframe, { action: "view-connection", value: true });
		postFromIframe(first.iframe, { loudness: { abc: 12 } });
		postFromIframe(first.iframe, { loudness: { abc: 30 } });

		await vi.waitFor(() =>
			expect(reports.at(-1)).toContainEqual({
				id: first.userId,
				isConnected: true,
				loudness: 30,
			}),
		);
		const reportsBefore = reports.length;
		// the loudest read goes out once, the next report starts over
		await vi.waitFor(() =>
			expect(reports.length).toBeGreaterThan(reportsBefore),
		);
		expect(reports.at(-1)).toContainEqual({
			id: first.userId,
			isConnected: true,
			loudness: 0,
		});
	});

	test("reports a caster whose stream dropped as disconnected", async () => {
		const reports: BroadcastAudioFeed[][] = [];
		const [first, second] = await renderCasterCameras({
			isMuted: false,
			reportFeeds: (feeds) => reports.push(feeds),
		});
		postFromIframe(first.iframe, { action: "view-connection", value: true });
		postFromIframe(second.iframe, { streamIDs: { abc: false } });
		await vi.waitFor(() =>
			expect(reports.at(-1)?.every((feed) => feed.isConnected)).toBe(true),
		);

		postFromIframe(first.iframe, { action: "view-connection", value: false });
		postFromIframe(second.iframe, { streamIDs: {} });

		await vi.waitFor(() =>
			expect(reports.at(-1)?.map((feed) => feed.isConnected)).toEqual([
				false,
				false,
			]),
		);
	});

	test("reports no casters outside OBS", async () => {
		const reportFeeds = vi.fn();
		await renderCasterCameras({ isMuted: true, reportFeeds });

		await new Promise((resolve) => setTimeout(resolve, 400));

		expect(reportFeeds).not.toHaveBeenCalled();
	});

	test("reports a name cut off without an ellipsis", async () => {
		const state = stateOf({ ...SCENARIO, scene: "rosters" });

		const problems = await overflowsOnAir({
			...state,
			settings: {
				...state.settings,
				css: '[data-scene="rosters"] [data-part="player-name"] { text-overflow: clip; }',
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
				css: '[data-scene="rosters"] [data-part="player-name"] { overflow: visible; }',
			},
		});

		expect(problems).toContainEqual(expect.stringContaining("sticks out"));
	});
});

/** The casters' cameras under a scene other than theirs, each with a VDO.ninja link that stays off the network. */
async function renderCasterCameras(
	clips: Pick<BroadcastClips, "isMuted" | "reportFeeds">,
) {
	const state = stateOf({ ...SCENARIO, scene: "game", casters: 2 });

	await render(
		<BroadcastClipsContext.Provider value={{ ...NO_BROADCAST_CLIPS, ...clips }}>
			<BroadcastOverlay
				sceneSet={CAST_SCENE_SET}
				state={{
					...state,
					casters: state.casters.map((caster) => ({
						...caster,
						vdoNinjaUrl: `https://vdo.invalid/?view=${caster.userId}`,
					})),
				}}
				view="live"
			/>
		</BroadcastClipsContext.Provider>,
	);

	return state.casters.map((caster) => ({
		userId: caster.userId,
		iframe: canvas().querySelector<HTMLIFrameElement>(
			`iframe[src*="view=${caster.userId}"]`,
		),
	}));
}

/** A message as the VDO.ninja page in the iframe posts it to the overlay. */
function postFromIframe(iframe: HTMLIFrameElement | null, data: unknown) {
	window.dispatchEvent(
		new MessageEvent("message", { data, source: iframe?.contentWindow }),
	);
}

function stateOf(scenario: DesignScenario.Scenario): CastBroadcastState {
	const state = DesignScenario.build({
		scenario,
		tournament: {
			name: "In The Zone 50",
			logoUrl: IMAGE_URL,
			organizationName: "Sendou.ink",
		},
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

/** Themed with the preset, without the web fonts it imports: the test doesn't depend on the network, their fallbacks are measured. */
function withPreset(
	state: CastBroadcastState,
	key: (typeof BROADCAST_THEME_PRESETS)[number]["key"],
): CastBroadcastState {
	const preset = BROADCAST_THEME_PRESETS.find(
		(candidate) => candidate.key === key,
	)!;

	return {
		...state,
		settings: {
			...state.settings,
			css: preset.css.replaceAll(/@import url\("[^"]*"\);/g, ""),
			variables: preset.variables,
		},
	};
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
			organizationName: wordsOfLength(CALENDAR_EVENT.NAME_MAX_LENGTH),
		},
		settings: {
			...longest.settings,
			headline: wordsOfLength(BROADCAST_HEADLINE_MAX_LENGTH),
			nowPlaying: longest.settings.nowPlaying
				? "W".repeat(BROADCAST_NOW_PLAYING_MAX_LENGTH)
				: "",
		},
		casters: longest.casters.map((caster) => ({
			...caster,
			pronouns: { subject: "they", object: "them" },
			customUrl: caster.customUrl
				? "w".repeat(USER.CUSTOM_URL_MAX_LENGTH)
				: null,
		})),
		match: longest.match
			? {
					...longest.match,
					bracketName: "W".repeat(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				}
			: null,
		music: longest.music
			? {
					...longest.music,
					tracks: longest.music.tracks.map((track) => ({
						...track,
						title: "W".repeat(BROADCAST_MUSIC_TITLE_MAX_LENGTH),
						artist: wordsOfLength(BROADCAST_MUSIC_TITLE_MAX_LENGTH),
					})),
				}
			: null,
	};
}

function withNowPlayingText(
	state: CastBroadcastState,
	nowPlaying: string,
): CastBroadcastState {
	return { ...state, settings: { ...state.settings, nowPlaying } };
}

function nowPlayingLine() {
	return canvas().querySelector('[data-part="now-playing"]');
}

function nowPlayingPart(name: string) {
	return nowPlayingLine()?.querySelector(`[data-part="${name}"]`) ?? null;
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
async function overflowsOfStinger(
	state: CastBroadcastState,
	variant?: BroadcastStingerVariant,
) {
	await playStinger(state, { stinger: variant });
	await document.fonts.ready;

	const stinger = stingerOnScreen();
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

/** Renders the `from` scene on air (the state's own by default), then takes the state to play its stinger. */
async function playStinger(
	state: CastBroadcastState,
	{
		from = state.live.scene,
		stinger,
	}: { from?: CastScene; stinger?: BroadcastStingerVariant } = {},
) {
	const screen = await render(
		<BroadcastOverlay
			sceneSet={CAST_SCENE_SET}
			state={{ ...state, live: { ...state.live, scene: from } }}
			view="live"
			stinger={stinger}
		/>,
	);
	await screen.rerender(
		<BroadcastOverlay
			sceneSet={CAST_SCENE_SET}
			state={{ ...state, takeId: state.takeId + 1 }}
			view="live"
			stinger={stinger}
		/>,
	);
}

function stingerOnScreen() {
	return canvas().querySelector<HTMLElement>('[data-part="stinger"]')!;
}

function stingerVariantOnScreen() {
	const stinger = stingerOnScreen();

	return {
		variant: stinger.dataset.variant,
		hasTeams: stinger.querySelector('[data-part="stinger-teams"]') !== null,
		hasTitleCard:
			stinger.querySelector('[data-part="stinger-title-card"]') !== null,
	};
}

function rostersPart(name: string) {
	return canvas().querySelector(`[data-scene="rosters"] [data-part="${name}"]`);
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
		(style.rotate !== "none" && style.rotate !== "0deg") ||
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

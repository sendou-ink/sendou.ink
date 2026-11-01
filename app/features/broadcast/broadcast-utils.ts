import type { Pronouns } from "~/db/tables-json";
import {
	BROADCAST_INK_COLORS,
	type BROADCAST_SCENE_PARTS,
} from "./broadcast-constants";
import type {
	BroadcastInk,
	BroadcastMatch,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
	ProducerState,
} from "./broadcast-types";
import * as SetProgress from "./core/SetProgress";

/** Builds the scene's `data-part` attributes, only allowing the parts documented in {@link BROADCAST_SCENE_PARTS}. */
export const scenePart =
	<S extends keyof typeof BROADCAST_SCENE_PARTS>(_scene: S) =>
	(name: (typeof BROADCAST_SCENE_PARTS)[S][number]) => ({
		"data-part": name,
	});

/** One of the featured match's teams as it stands in the set, see {@link matchSides}. */
export interface MatchSide {
	/** `a` on the left, `b` on the right. */
	side: "a" | "b";
	/** In bracket order. */
	index: 0 | 1;
	team: BroadcastTeam | null;
	score: number;
	isWinner: boolean;
	isLoser: boolean;
}

/** The featured match's teams from left to right, with their standing in the set as the view shows it. */
export function matchSides(
	match: BroadcastMatch,
	view: BroadcastView,
	producer: Pick<ProducerState, "swapSides">,
): [MatchSide, MatchSide] {
	const progress = match.progress[view];
	const winner = SetProgress.winner(progress);

	const side = (index: 0 | 1): MatchSide => ({
		side: sideOf(index, producer),
		index,
		team: match.teams[index],
		score: progress.scores[index],
		isWinner: winner === index,
		isLoser: winner !== null && winner !== index,
	});

	return producer.swapSides ? [side(1), side(0)] : [side(0), side(1)];
}

/**
 * Ink colors of the game the view shows, `null` when none were picked for it: picked for an earlier game (its
 * result is on air), another match or not at all.
 */
export function gameInk(
	state: Pick<BroadcastState, "ink" | "match">,
	view: BroadcastView,
): BroadcastInk | null {
	const ink = state.ink;
	if (!ink || ink.matchId !== state.match?.id) return null;

	return ink.resultCount === state.match.progress[view].resultCount
		? ink
		: null;
}

/**
 * Ink colors as the team color variables, the left team's as `a`. Text on each color is black or white,
 * whichever reads better. Empty without ink colors, keeping the theme's.
 */
export function inkColorVars({
	ink,
	swapSides,
}: {
	ink: BroadcastInk | null;
	swapSides: boolean;
}): Record<string, string> {
	const pair = BROADCAST_INK_COLORS.find((color) => color.key === ink?.key);
	if (!ink || !pair) return {};

	const colorOf = (index: 0 | 1) =>
		(index === 0) !== ink.isFlipped ? pair.a : pair.b;
	const left = colorOf(swapSides ? 1 : 0);
	const right = colorOf(swapSides ? 0 : 1);

	return {
		"--bc-team-a": left,
		"--bc-team-a-text": readableTextOn(left),
		"--bc-team-b": right,
		"--bc-team-b-text": readableTextOn(right),
	};
}

/** Pronouns as shown next to a name, e.g. "he/him". */
export function pronounsLabel(pronouns: Pronouns) {
	return `${pronouns.subject}/${pronouns.object}`;
}

/** Bracket and round, e.g. "Main bracket · Winners round 2". */
export function roundLabel(
	match: Pick<BroadcastMatch, "bracketName" | "roundName">,
) {
	return [match.bracketName, match.roundName].filter(Boolean).join(" · ");
}

function sideOf(
	index: 0 | 1,
	producer: Pick<ProducerState, "swapSides">,
): "a" | "b" {
	return (index === 0) !== producer.swapSides ? "a" : "b";
}

const DARK_TEXT = "#15131f";
const LIGHT_TEXT = "#fff";

function readableTextOn(hex: string) {
	const background = relativeLuminance(hex);
	const contrastWithLight = 1.05 / (background + 0.05);
	const contrastWithDark =
		(background + 0.05) / (relativeLuminance(DARK_TEXT) + 0.05);

	return contrastWithDark > contrastWithLight ? DARK_TEXT : LIGHT_TEXT;
}

function relativeLuminance(hex: string) {
	const [r, g, b] = [1, 3, 5].map((start) => {
		const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
		return channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	});

	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

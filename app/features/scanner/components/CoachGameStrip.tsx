/**
 * Coach mode's games side by side, each as wide as its length (never narrower
 * than readable), the strip scrolling when they don't fit and following the
 * game being played. A run of games the filters hide collapses to
 * a zigzag. Each game's bar is colored by its result and fills as the video
 * plays through it; picking a game jumps the video to its start.
 */
import clsx from "clsx";
import { ModeImage } from "~/components/Image";
import { StageBannerBox } from "~/components/StageBannerBox";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { modeLabel, stageLabel } from "../core/labels";
import type { ScannerMatch } from "../core/scanner-match";
import styles from "./CoachGameStrip.module.css";

/** room left before a tile scrolled into view, hinting at the games before it */
const REVEAL_MARGIN_PX = 48;

export interface CoachGame {
	/** the game's number in the file's list */
	number: number;
	match: ScannerMatch;
	result: "win" | "loss" | null;
}

export function CoachGameStrip({
	games,
	isShown,
	currentTime,
	onSelect,
}: {
	games: readonly CoachGame[];
	isShown: (game: CoachGame) => boolean;
	/** seconds into the video the player is at */
	currentTime: number;
	onSelect: (game: CoachGame) => void;
}) {
	const items = stripItems(games, isShown);
	const shownGames = games.filter(isShown);
	const totalDuration = shownGames.reduce(
		(sum, game) => sum + durationOf(game.match),
		0,
	);

	return (
		<nav className={styles.strip} aria-label="Games">
			{items.map((item) => {
				if (item.type === "CUTOFF") {
					return <GameCutoff key={item.key} />;
				}

				const { game } = item;
				const share =
					totalDuration > 0
						? durationOf(game.match) / totalDuration
						: 1 / shownGames.length;

				return (
					<GameButton
						key={game.number}
						game={game}
						share={share}
						currentTime={currentTime}
						onSelect={onSelect}
					/>
				);
			})}
		</nav>
	);
}

/** The game the video is inside of at `t`; undefined between games. */
export function gameAt<G extends CoachGame>(
	games: readonly G[],
	t: number,
): G | undefined {
	return games.find((game) => covers(game.match, t));
}

function GameButton({
	game,
	share,
	currentTime,
	onSelect,
}: {
	game: CoachGame;
	share: number;
	currentTime: number;
	onSelect: (game: CoachGame) => void;
}) {
	const { match, result } = game;
	const mode: ModeShort | null = match.mode ?? match.objective?.mode ?? null;
	const stage = stageLabel(match.stage);
	const isCurrent = covers(match, currentTime);

	const tileClassName = clsx(styles.game, {
		[styles.current]: isCurrent,
		[styles.win]: result === "win",
		[styles.loss]: result === "loss",
	});
	const tileStyle = {
		"--share": share,
		"--duration": durationOf(match),
		"--progress": progressOf(match, currentTime),
	};
	const content = (
		<>
			<button
				type="button"
				className={styles.gameButton}
				aria-current={isCurrent ? "true" : undefined}
				ref={isCurrent ? revealInStrip : undefined}
				disabled={match.startsAt === null}
				title={[
					`Game ${game.number}`,
					modeLabel(mode),
					stage,
					result === "win" ? "Win" : result === "loss" ? "Loss" : null,
				]
					.filter(Boolean)
					.join(" · ")}
				onClick={() => onSelect(game)}
			>
				<span className={styles.gameTop}>
					<span className={styles.gameNumber}>{game.number}</span>
					{mode ? <ModeImage mode={mode} size={18} /> : null}
				</span>
				<span className={styles.stage}>
					{stage ? shortStageName(stage) : "?"}
				</span>
			</button>
			<span className={styles.progress} />
		</>
	);

	return match.stage !== null ? (
		<StageBannerBox
			stageId={match.stage}
			className={tileClassName}
			style={tileStyle}
		>
			{content}
		</StageBannerBox>
	) : (
		<div className={tileClassName} style={tileStyle}>
			{content}
		</div>
	);
}

/** Scrolls the strip (never the page) to a tile out of its view. */
function revealInStrip(button: HTMLButtonElement | null) {
	const strip = button?.closest("nav");
	if (!button || !strip) return;

	const tile = button.getBoundingClientRect();
	const view = strip.getBoundingClientRect();
	if (tile.left >= view.left && tile.right <= view.right) return;

	strip.scrollBy({
		left: tile.left - view.left - REVEAL_MARGIN_PX,
		behavior: "smooth",
	});
}

function GameCutoff() {
	return (
		<svg
			className={styles.cutoff}
			viewBox="0 0 12 64"
			preserveAspectRatio="none"
			aria-hidden
		>
			<path
				d="M6 0 Q 11 4 6 8 T 6 16 T 6 24 T 6 32 T 6 40 T 6 48 T 6 56 T 6 64"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

/** Games in order, each run of hidden ones collapsed to a single cutoff. */
function stripItems(
	games: readonly CoachGame[],
	isShown: (game: CoachGame) => boolean,
) {
	const items: Array<
		{ type: "GAME"; game: CoachGame } | { type: "CUTOFF"; key: string }
	> = [];

	for (const game of games) {
		if (isShown(game)) {
			items.push({ type: "GAME", game });
		} else if (items.at(-1)?.type !== "CUTOFF") {
			items.push({ type: "CUTOFF", key: `cutoff-${game.number}` });
		}
	}

	return items;
}

function covers(match: ScannerMatch, t: number): boolean {
	return (
		match.startsAt !== null &&
		match.endsAt !== null &&
		match.startsAt <= t &&
		t <= match.endsAt
	);
}

function durationOf(match: ScannerMatch): number {
	if (match.startsAt === null || match.endsAt === null) return 0;
	return Math.max(0, match.endsAt - match.startsAt);
}

/** How far through the game the video is at `t`, 0..1. */
function progressOf(match: ScannerMatch, t: number): number {
	if (match.startsAt === null || match.endsAt === null) return 0;
	if (t <= match.startsAt) return 0;
	if (t >= match.endsAt) return 1;
	return (t - match.startsAt) / (match.endsAt - match.startsAt);
}

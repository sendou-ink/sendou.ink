/**
 * Coach mode (`view=coach&name=`): a scanned file's games in a strip above a
 * player of the file itself, with their coach events (core/CoachEvents.ts)
 * filterable by type beside it — picking a game or an event jumps the video to
 * its start. Games the filters (core/CoachFilters.ts) hide drop their events,
 * and while any is set playback keeps to the games shown, jumping past the
 * hidden ones and the footage between games. A bar under the player
 * (CoachControls) steps between the games, lives and events shown, and the map
 * as last opened (CoachMinimap) tops the events, following the video; clicking
 * it swaps the two, the video playing on in the map's place. The file is
 * the one scanned or opened this visit, else the user opens it again (only the
 * scan was saved).
 */
// xxx: last event we dont have win/loss
import { FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { useSearchParam } from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import * as CoachEvents from "../core/CoachEvents";
import * as CoachFilters from "../core/CoachFilters";
import * as CoachPlayback from "../core/CoachPlayback";
import { povDeathTimes } from "../core/clips/scoring";
import { formatClock, formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { type BuiltMatch, isHistoryOnly } from "../core/match-builder";
import { scannerSearchParams } from "../scanner-search-params";
import { CoachControls, type CoachJumps } from "./CoachControls";
import { CoachFilterBar } from "./CoachFilterBar";
import { type CoachGame, CoachGameStrip, gameAt } from "./CoachGameStrip";
import { CoachMinimap } from "./CoachMinimap";
import styles from "./CoachView.module.css";
import { NotFound } from "./NotFound";
import { SessionHeader } from "./SessionHeader";
import type { ScanEvent } from "./session-data";
import { cachedBuild, useStoredVod, useVodMinimaps } from "./vod-data";
import {
	rememberVisitVodFile,
	useVodScan,
	VOD_FILE_ACCEPT,
	visitVodFile,
} from "./vod-scan";

// xxx: optionally, drop in a live minimap that will be synced

const ALL = "ALL";

/** Coach data keyed by the build, so the player's time updates don't redo it. */
const coachDataCache = new WeakMap<
	readonly BuiltMatch<ScanEvent>[],
	{
		games: CoachSessionGame[];
		entries: CoachEntry[];
		options: CoachFilters.Options;
	}
>();

interface CoachSessionGame extends CoachGame {
	/** seconds into the video each of the POV player's lives starts at */
	lifeStarts: number[];
}

interface CoachEntry extends CoachEvents.CoachEvent {
	game: CoachGame;
}

export function CoachView() {
	const [name] = useSearchParam(scannerSearchParams, "name");
	const scan = useVodScan();
	if (name === null) return <NotFound>No file was picked.</NotFound>;
	if (scan.name === name) {
		return <CoachSession key={name} name={name} events={scan.events} />;
	}
	return <StoredCoachSession key={name} name={name} />;
}

/** A scan saved in an earlier visit. */
function StoredCoachSession({ name }: { name: string }) {
	const stored = useStoredVod(name);
	if (stored.state === "loading") return null;
	if (stored.state === "missing") {
		return <NotFound>This VoD is no longer saved.</NotFound>;
	}
	return <CoachSession name={name} events={stored.events} />;
}

function CoachSession({
	name,
	events,
}: {
	/** the scanned file's name */
	name: string;
	events: readonly ScanEvent[];
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [file, setFile] = useState(() => visitVodFile(name));
	const url = useFileUrl(file);
	const [filter, setFilter] = useState<CoachEvents.CoachEventType | typeof ALL>(
		ALL,
	);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [gameFilters, setGameFilters] = useState(CoachFilters.DEFAULT_FILTERS);
	const [currentTime, setCurrentTime] = useState(0);
	const [isPaused, setIsPaused] = useState(true);
	const [speed, setSpeed] = useState(1);
	const minimaps = useVodMinimaps(name);
	const [isMapBig, setIsMapBig] = useState(false);
	/** the video lives here, outside React's tree, so swapping places moves it instead of remounting it */
	const [videoHost] = useState(() => {
		const host = document.createElement("div");
		host.className = styles.videoHost;
		return host;
	});

	const {
		games,
		entries: allEntries,
		options,
	} = coachData(cachedBuild(events));
	const isShown = (game: CoachGame) =>
		CoachFilters.passes(game.match, gameFilters);
	const shownGames = games.filter(isShown);
	const entries = allEntries.filter((entry) => isShown(entry.game));
	const counts = new Map<CoachEvents.CoachEventType, number>();
	for (const entry of entries) {
		counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
	}
	const shown = entries.filter(
		(entry) => filter === ALL || entry.type === filter,
	);
	const currentGame = gameAt(games, currentTime);
	const minimap = currentGame
		? minimaps.findLast(
				(candidate) =>
					candidate.t <= currentTime &&
					candidate.t >= currentGame.match.startsAt!,
			)
		: undefined;

	/** Picking from the lists starts the video; the bar's steps keep it paused or playing. */
	const seek = (t: number, { play }: { play: boolean }) => {
		const video = videoRef.current;
		if (!video) return;
		video.currentTime = t;
		setCurrentTime(t);
		if (play) void video.play().catch(() => {});
	};

	const jumpTo = (entry: CoachEntry, playback: { play: boolean }) => {
		setSelectedKey(entryKey(entry));
		seek(entry.start, playback);
	};

	const selectGame = (game: CoachGame, playback: { play: boolean }) => {
		if (game.match.startsAt !== null) seek(game.match.startsAt, playback);
	};

	const togglePlay = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) void video.play().catch(() => {});
		else video.pause();
	};

	const seekBy = (seconds: number) => {
		const video = videoRef.current;
		if (!video) return;
		seek(Math.max(0, video.currentTime + seconds), { play: false });
	};

	const changeSpeed = (newSpeed: number) => {
		const video = videoRef.current;
		if (!video) return;
		video.defaultPlaybackRate = newSpeed;
		video.playbackRate = newSpeed;
	};

	const jumps: CoachJumps = {
		GAME: stepsAlong(
			shownGames.filter((game) => game.match.startsAt !== null),
			(game) => game.match.startsAt!,
			currentTime,
			(game) => selectGame(game, { play: false }),
		),
		LIFE: stepsAlong(
			shownGames.flatMap((game) => game.lifeStarts),
			(start) => start,
			currentTime,
			(start) => seek(start, { play: false }),
		),
		EVENT: stepsAlong(
			shown,
			(entry) => entry.start,
			currentTime,
			(entry) => jumpTo(entry, { play: false }),
		),
		SECONDS: {
			previous: () => seekBy(-CoachPlayback.SECONDS_STEP_S),
			next: () => seekBy(CoachPlayback.SECONDS_STEP_S),
		},
	};

	const followPlayback = (video: HTMLVideoElement) => {
		setCurrentTime(video.currentTime);
		if (video.paused || video.seeking || !CoachFilters.isActive(gameFilters)) {
			return;
		}

		const game = gameAt(games, video.currentTime);
		if (game && isShown(game)) return;

		const nextShown = games.find(
			(candidate) =>
				candidate.match.startsAt !== null &&
				candidate.match.startsAt > video.currentTime &&
				isShown(candidate),
		);
		if (nextShown) {
			video.currentTime = nextShown.match.startsAt!;
		} else {
			video.pause();
		}
	};

	const swapMapAndVideo = url ? () => setIsMapBig(!isMapBig) : undefined;
	const minimapView = (
		<CoachMinimap
			minimap={minimap}
			currentTime={currentTime}
			isInGame={currentGame !== undefined}
			onSwap={swapMapAndVideo}
		/>
	);
	const videoSlot = <NodeSlot node={videoHost} />;

	return (
		<div className={styles.view}>
			{url
				? createPortal(
						// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
						<video
							ref={videoRef}
							className={styles.video}
							src={url}
							controls
							playsInline
							onTimeUpdate={(e) => followPlayback(e.currentTarget)}
							onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
							onPlay={() => setIsPaused(false)}
							onPause={() => setIsPaused(true)}
							onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
						/>,
						videoHost,
					)
				: null}
			<SessionHeader
				back={{
					to: scannerSearchParams.href(SCANNER_PAGE, { view: "vod", name }),
					label: "Back to the file's games",
				}}
			>
				<div className={styles.title}>Coach mode</div>
				<div className={styles.fileName}>{name}</div>
			</SessionHeader>
			<div className={styles.games}>
				<CoachFilterBar
					filters={gameFilters}
					options={options}
					onChange={setGameFilters}
					summary={
						<span className={styles.gamesSummary}>
							{shownGames.length} of {games.length} games
						</span>
					}
				/>
				<CoachGameStrip
					games={games}
					isShown={isShown}
					currentTime={currentTime}
					onSelect={(game) => selectGame(game, { play: true })}
				/>
			</div>
			<div className={styles.layout}>
				<div className={styles.player}>
					{url ? (
						isMapBig ? (
							minimapView
						) : (
							videoSlot
						)
					) : (
						<div className={styles.openFile}>
							<p>
								Open <b>{name}</b> again to watch it here: only its scan was
								saved.
							</p>
							<label className={styles.fileButton}>
								<FolderOpen size={16} />
								Open file
								<input
									type="file"
									accept={VOD_FILE_ACCEPT}
									onChange={(e) => {
										const picked = e.target.files?.[0];
										e.target.value = "";
										if (!picked) return;
										rememberVisitVodFile(picked);
										setFile(picked);
									}}
								/>
							</label>
						</div>
					)}
					{url ? (
						<CoachControls
							isPaused={isPaused}
							speed={speed}
							jumps={jumps}
							onTogglePlay={togglePlay}
							onSpeedChange={changeSpeed}
							isMapBig={isMapBig}
							onSwapMap={() => setIsMapBig(!isMapBig)}
						/>
					) : null}
				</div>
				<div className={styles.events}>
					{url && isMapBig ? videoSlot : minimapView}
					<SendouChipRadioGroup wrap>
						<SendouChipRadio
							name="coach-filter"
							value={ALL}
							checked={filter === ALL}
							onChange={() => setFilter(ALL)}
						>
							All ({entries.length})
						</SendouChipRadio>
						{CoachEvents.DEFINITIONS.filter((definition) =>
							counts.has(definition.type),
						).map((definition) => (
							<SendouChipRadio
								key={definition.type}
								name="coach-filter"
								value={definition.type}
								checked={filter === definition.type}
								onChange={() => setFilter(definition.type)}
							>
								{definition.label} ({counts.get(definition.type)})
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
					{shown.length === 0 ? (
						<p className={styles.empty}>
							{allEntries.length === 0
								? "No events were found in this file."
								: "No events in the games shown."}
						</p>
					) : (
						<ol className={styles.list}>
							{shown.map((entry) => (
								<li key={entryKey(entry)}>
									<button
										type="button"
										className={styles.entry}
										aria-current={entryKey(entry) === selectedKey}
										onClick={() => jumpTo(entry, { play: true })}
									>
										<span className={styles.entryType}>
											{CoachEvents.label(entry.type)}
										</span>
										<span className={styles.entryTime}>
											{entry.time !== null ? formatClock(entry.time) : null}
										</span>
										<span className={styles.entryWhere}>
											{gameLabel(entry)}
										</span>
										<span className={styles.entryPosition}>
											{formatPosition(entry.start)}
										</span>
									</button>
								</li>
							))}
						</ol>
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * Every game with its coach events, chronological, and what the game filters
 * can pick from. Games known only from the battle log hold no gameplay and are
 * left out of the numbering, as on the cards.
 */
function coachData(built: readonly BuiltMatch<ScanEvent>[]) {
	const cached = coachDataCache.get(built);
	if (cached) return cached;

	const gameBuilds = built
		.filter((b) => !isHistoryOnly(b))
		.map((b) => ({ match: b.match, povDeaths: povDeathTimes(b.sources) }));
	const games = gameBuilds.map(
		(b, index): CoachSessionGame => ({
			number: index + 1,
			match: b.match,
			lifeStarts: CoachEvents.lifeStarts(b.match, b.povDeaths),
		}),
	);
	const entries = gameBuilds.flatMap((b, index) =>
		CoachEvents.ofMatch(b.match, b.povDeaths).map(
			(event): CoachEntry => ({ ...event, game: games[index]! }),
		),
	);
	const data = {
		games,
		entries,
		options: CoachFilters.options(games.map((game) => game.match)),
	};
	coachDataCache.set(built, data);
	return data;
}

function stepsAlong<T>(
	items: readonly T[],
	startOf: (item: T) => number,
	t: number,
	onJump: (item: T) => void,
): CoachJumps[keyof CoachJumps] {
	const jumpFor = (direction: CoachPlayback.Direction) => {
		const item = CoachPlayback.step(items, startOf, t, direction);
		return item === undefined ? null : () => onJump(item);
	};
	return { previous: jumpFor("previous"), next: jumpFor("next") };
}

/** Entries are rebuilt with the scan's events, so selection goes by their fields. */
function entryKey(entry: CoachEntry): string {
	return `${entry.game.number}-${entry.type}-${entry.start}`;
}

function gameLabel(entry: CoachEntry): string {
	return [
		`Game ${entry.game.number}`,
		modeLabel(entry.game.match.mode),
		stageLabel(entry.game.match.stage),
	]
		.filter(Boolean)
		.join(" · ");
}

/** Holds `node`, a DOM node React doesn't own, for as long as it is rendered. */
function NodeSlot({ node }: { node: HTMLElement }) {
	return (
		<div
			className={styles.slot}
			ref={(slot) => {
				if (slot && node.parentElement !== slot) slot.appendChild(node);
			}}
		/>
	);
}

/** The file as an object URL, released when it changes or the view goes away. */
function useFileUrl(file: File | null): string | null {
	const [url, setUrl] = useState<string | null>(null);

	// object URLs are a resource outside React: create and revoke with the file
	useEffect(() => {
		if (!file) return;
		const objectUrl = URL.createObjectURL(file);
		setUrl(objectUrl);
		return () => {
			URL.revokeObjectURL(objectUrl);
			setUrl(null);
		};
	}, [file]);

	return url;
}

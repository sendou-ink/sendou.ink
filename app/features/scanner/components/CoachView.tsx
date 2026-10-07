/**
 * Coach mode (`view=coach&name=`): a scanned file's games in a strip above a
 * player of the file itself, with their coach events (core/CoachEvents.ts)
 * filterable by type beside it — picking a game or an event jumps the video to
 * its start. Games the filters (core/CoachFilters.ts) hide drop their events,
 * and while any is set playback keeps to the games shown, jumping past the
 * hidden ones and the footage between games. The file is the one scanned or opened this
 * visit, else the user opens it again (only the scan was saved).
 */
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { useSearchParam } from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import * as CoachEvents from "../core/CoachEvents";
import * as CoachFilters from "../core/CoachFilters";
import { povDeathTimes } from "../core/clips/scoring";
import { formatClock, formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { type BuiltMatch, isHistoryOnly } from "../core/match-builder";
import { scannerSearchParams } from "../scanner-search-params";
import { CoachFilterBar } from "./CoachFilterBar";
import { type CoachGame, CoachGameStrip, gameAt } from "./CoachGameStrip";
import styles from "./CoachView.module.css";
import { NotFound } from "./NotFound";
import { SessionHeader } from "./SessionHeader";
import type { ScanEvent } from "./session-data";
import { cachedBuild, useStoredVod } from "./vod-data";
import {
	rememberVisitVodFile,
	useVodScan,
	VOD_FILE_ACCEPT,
	visitVodFile,
} from "./vod-scan";

const ALL = "ALL";

/** Coach data keyed by the build, so the player's time updates don't redo it. */
const coachDataCache = new WeakMap<
	readonly BuiltMatch<ScanEvent>[],
	{ games: CoachGame[]; entries: CoachEntry[]; options: CoachFilters.Options }
>();

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

	const {
		games,
		entries: allEntries,
		options,
	} = coachData(cachedBuild(events));
	const isShown = (game: CoachGame) =>
		CoachFilters.passes(game.match, gameFilters);
	const shownGameCount = games.filter(isShown).length;
	const entries = allEntries.filter((entry) => isShown(entry.game));
	const counts = new Map<CoachEvents.CoachEventType, number>();
	for (const entry of entries) {
		counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
	}
	const shown = entries.filter(
		(entry) => filter === ALL || entry.type === filter,
	);
	const selectedIndex = shown.findIndex(
		(entry) => entryKey(entry) === selectedKey,
	);
	const previous = selectedIndex > 0 ? shown[selectedIndex - 1] : undefined;
	const next = shown[selectedIndex + 1];

	const seek = (t: number) => {
		const video = videoRef.current;
		if (!video) return;
		video.currentTime = t;
		setCurrentTime(t);
		void video.play().catch(() => {});
	};

	const jumpTo = (entry: CoachEntry) => {
		setSelectedKey(entryKey(entry));
		seek(entry.start);
	};

	const selectGame = (game: CoachGame) => {
		if (game.match.startsAt !== null) seek(game.match.startsAt);
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

	return (
		<div className={styles.view}>
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
							{shownGameCount} of {games.length} games
						</span>
					}
				/>
				<CoachGameStrip
					games={games}
					isShown={isShown}
					currentTime={currentTime}
					onSelect={selectGame}
				/>
			</div>
			<div className={styles.layout}>
				<div className={styles.player}>
					{url ? (
						// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
						<video
							ref={videoRef}
							className={styles.video}
							src={url}
							controls
							playsInline
							onTimeUpdate={(e) => followPlayback(e.currentTarget)}
							onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
						/>
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
					<div className={styles.nav}>
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<ChevronLeft />}
							aria-label="Previous event"
							isDisabled={!previous}
							onClick={previous ? () => jumpTo(previous) : undefined}
						/>
						<span className={styles.position}>
							{selectedIndex === -1 ? "–" : selectedIndex + 1} / {shown.length}
						</span>
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<ChevronRight />}
							aria-label="Next event"
							isDisabled={!next}
							onClick={next ? () => jumpTo(next) : undefined}
						/>
					</div>
				</div>
				<div className={styles.events}>
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
										onClick={() => jumpTo(entry)}
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

	const gameBuilds = built.filter((b) => !isHistoryOnly(b));
	const games = gameBuilds.map(
		(b, index): CoachGame => ({ number: index + 1, match: b.match }),
	);
	const entries = gameBuilds.flatMap((b, index) =>
		CoachEvents.ofMatch(b.match, povDeathTimes(b.sources)).map(
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

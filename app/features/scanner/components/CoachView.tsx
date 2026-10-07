/**
 * Coach mode (`view=coach&name=`): a scanned file's coach events
 * (core/CoachEvents.ts) across all its games, filterable by type, beside a
 * player of the file itself — picking an event jumps the video to the start of
 * its window. The file is the one scanned or opened this visit, else the user
 * opens it again (only the scan was saved).
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
import { povDeathTimes } from "../core/clips/scoring";
import { formatClock, formatPosition } from "../core/format";
import { modeLabel, stageLabel } from "../core/labels";
import { type BuiltMatch, isHistoryOnly } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import { scannerSearchParams } from "../scanner-search-params";
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

interface CoachEntry extends CoachEvents.CoachEvent {
	/** the game's number in the session's list */
	game: number;
	match: ScannerMatch;
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

	const entries = coachEntries(cachedBuild(events));
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

	const jumpTo = (entry: CoachEntry) => {
		setSelectedKey(entryKey(entry));
		const video = videoRef.current;
		if (!video) return;
		video.currentTime = entry.start;
		void video.play().catch(() => {});
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
						<p className={styles.empty}>No events were found in this file.</p>
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
 * Every game's coach events, chronological. Games known only from the battle
 * log hold no gameplay and are left out of the numbering, as on the cards.
 */
function coachEntries(built: readonly BuiltMatch<ScanEvent>[]): CoachEntry[] {
	return built
		.filter((b) => !isHistoryOnly(b))
		.flatMap((b, index) =>
			CoachEvents.ofMatch(b.match, povDeathTimes(b.sources)).map((event) => ({
				...event,
				game: index + 1,
				match: b.match,
			})),
		);
}

/** Entries are rebuilt every render, so selection goes by their fields. */
function entryKey(entry: CoachEntry): string {
	return `${entry.game}-${entry.type}-${entry.start}`;
}

function gameLabel(entry: CoachEntry): string {
	return [
		`Game ${entry.game}`,
		modeLabel(entry.match.mode),
		stageLabel(entry.match.stage),
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

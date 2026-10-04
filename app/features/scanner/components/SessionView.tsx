/**
 * Everything below a session's page header, rendered identically for a live
 * session, a past session and a scanned VoD: the header the caller supplies
 * (fed the built matches and the summary line), the clip strip, then the
 * match cards newest first. A session mixing lobbies (private battles beside
 * X or open play) splits into lobby tabs; sets are a private battle concept,
 * so only that list gets set dividers. Games known only from browsing the
 * battle log stay hidden until asked for. Live and File share this all the
 * way down to the clip cutter.
 */

import { Eye, EyeOff } from "lucide-react";
import type * as React from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start";
import type { IngestSkipReason } from "../core/match-builder";
import {
	type BuiltMatch,
	ingestSkipReasons,
	isHistoryOnly,
} from "../core/match-builder";
import { assignMatchSets } from "../core/match-sets";
import type { ScannerMatch } from "../core/scanner-match";
import { kdRatio, type SessionSummary, sessionSummary } from "../core/sessions";
import type { ScannerLobby } from "../scanner-types";
import type { ScannerClip } from "../store/clips";
import { ClipDialog } from "./ClipDialog";
import { ClipStrip } from "./ClipStrip";
import { MatchCard } from "./MatchCard";
import styles from "./SessionView.module.css";
import { aggregateSendStatus } from "./sendou-ingest";
import type { GetFrame, ScanEvent, SessionKind } from "./session-data";
import { uploadStateOf } from "./UploadStatus";

const NO_KEYS: ReadonlySet<React.Key> = new Set();

type LobbyGroup = "private" | "x" | "other";

const LOBBY_GROUPS: LobbyGroup[] = ["private", "x", "other"];

const LOBBY_GROUP_LABELS: Record<LobbyGroup, string> = {
	private: "Private Battle",
	x: "X Battle",
	other: "Other",
};

export interface SessionInfo {
	/** chronological */
	built: BuiltMatch<ScanEvent>[];
	summary: SessionSummary;
	/** `8 games · 5–3 · K/D 1.4 · 3 clips` */
	summaryLine: string;
	/** aligned with `built` */
	clipCounts: number[];
	skipReasons: Map<BuiltMatch<ScanEvent>, IngestSkipReason>;
}

export function SessionView({
	kind,
	built,
	events,
	originT,
	clips,
	clipsTitle,
	running,
	header,
	getFrame,
	canUpload,
	onUpload,
	emptyText,
	children,
}: {
	kind: SessionKind;
	/**
	 * `events` built into matches, chronological. Reusing the same `BuiltMatch`
	 * objects across renders lets the unchanged cards skip rendering.
	 */
	built: BuiltMatch<ScanEvent>[];
	/** chronological */
	events: readonly ScanEvent[];
	/** stream/file second positions count from */
	originT: number;
	/** this session's clips, best first */
	clips: readonly ScannerClip[];
	clipsTitle: string;
	/** a capture or scan is still adding to this session: its newest unfinished match can't expand yet */
	running: boolean;
	header: (info: SessionInfo) => React.ReactNode;
	getFrame: (event: ScanEvent) => GetFrame | undefined;
	/** logged in: Retry/Upload buttons show */
	canUpload?: boolean;
	/** absent for sessions whose matches never upload (VoD scans): the cards show no upload state */
	onUpload?: (built: BuiltMatch<ScanEvent>) => void;
	emptyText: string;
	/** rendered between the header and the clips (a scan's progress, an error) */
	children?: React.ReactNode;
}) {
	const [playing, setPlaying] = useState<ScannerClip | null>(null);
	const [selectedGroup, setSelectedGroup] = useState<LobbyGroup | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	const skipReasons = ingestSkipReasons(built);
	const clipsByMatch = built.map((b, index) =>
		clipsOf(b.match, built[index + 1]?.match, clips),
	);
	const summary = sessionSummary(built.map((b) => b.match));
	const info: SessionInfo = {
		built,
		summary,
		summaryLine: summaryLine(summary, clips.length),
		clipCounts: clipsByMatch.map((matchClips) => matchClips.length),
		skipReasons,
	};
	const justFormedKeys = useJustFormedKeys(built.map(keyOf));
	// the game being played is the only one still gathering events; a newer
	// map intro means it is over even before that game has a card of its own
	const lastBuiltT =
		built.at(-1)?.sources.at(-1)?.t ?? Number.NEGATIVE_INFINITY;
	const newerGameStarted = events.some(
		(event) => event.type === MAP_START_EVENT_TYPE && event.t > lastBuiltT,
	);
	const groups = LOBBY_GROUPS.map((group) => ({
		group,
		matches: built.filter((b) => lobbyGroup(b.match.lobby) === group),
	})).filter(({ matches }) => matches.length > 0);
	const activeGroup =
		groups.find(({ group }) => group === selectedGroup) ?? groups[0];
	const historyCount = activeGroup?.matches.filter(isHistoryOnly).length ?? 0;
	const isShown = (b: BuiltMatch<ScanEvent>) =>
		showHistory || !isHistoryOnly(b);
	const shownBuilt = built.filter(isShown);

	const renderMatch = (b: BuiltMatch<ScanEvent>) => {
		const index = built.indexOf(b);
		const key = keyOf(b);
		return (
			<MatchCard
				key={key}
				built={b}
				number={shownBuilt.indexOf(b) + 1}
				originT={originT}
				kind={kind}
				justFormed={justFormedKeys.has(key)}
				expandable={
					!(
						running &&
						index === built.length - 1 &&
						b.match.winner === null &&
						!newerGameStarted
					)
				}
				upload={
					onUpload
						? uploadStateOf({
								send: aggregateSendStatus(b.sources),
								skipReason: skipReasons.get(b),
								lobby: b.match.lobby,
								canUpload: canUpload ?? false,
								onUpload: () => onUpload(b),
							})
						: null
				}
				clips={clipsByMatch[index]!}
				onPlayClip={setPlaying}
				getFrame={getFrame}
			/>
		);
	};

	return (
		<div className={styles.view}>
			<div className={styles.header}>{header(info)}</div>
			{children}
			<ClipStrip
				title={clipsTitle}
				clips={clips}
				onPlay={setPlaying}
				sourceLabel={(clip) => {
					const source = built.find((_, index) =>
						clipsByMatch[index]!.includes(clip),
					);
					const number = source ? shownBuilt.indexOf(source) + 1 : 0;
					return number > 0 ? `Game ${number}` : "";
				}}
			/>
			{!activeGroup ? (
				<p className={styles.empty}>{emptyText}</p>
			) : (
				<SendouTabs
					selectedKey={activeGroup.group}
					onSelectionChange={(key) => setSelectedGroup(key as LobbyGroup)}
				>
					<SendouTabList
						actions={
							historyCount > 0 ? (
								<SendouButton
									variant="minimal"
									size="miniscule"
									className={styles.historyButton}
									icon={showHistory ? <EyeOff /> : <Eye />}
									onClick={() => setShowHistory(!showHistory)}
								>
									{showHistory
										? "Hide battle log"
										: `Show battle log (${historyCount})`}
								</SendouButton>
							) : null
						}
					>
						{groups.map(({ group, matches }) => (
							<SendouTab key={group} id={group} number={matches.length}>
								{LOBBY_GROUP_LABELS[group]}
							</SendouTab>
						))}
					</SendouTabList>
					{groups.map(({ group, matches }) => (
						<SendouTabPanel key={group} id={group}>
							<MatchList
								matches={matches.filter(isShown)}
								sets={group === "private"}
								renderMatch={renderMatch}
							/>
						</SendouTabPanel>
					))}
				</SendouTabs>
			)}
			{playing ? (
				<ClipDialog clip={playing} onClose={() => setPlaying(null)} />
			) : null}
		</div>
	);
}

/** One lobby's matches newest first, with set dividers (numbered within the list) when `sets`. */
function MatchList({
	matches,
	sets,
	renderMatch,
}: {
	/** chronological */
	matches: readonly BuiltMatch<ScanEvent>[];
	sets: boolean;
	renderMatch: (built: BuiltMatch<ScanEvent>) => React.ReactNode;
}) {
	const setNumbers = sets ? assignMatchSets(matches.map((b) => b.match)) : [];
	const showSetDividers = (setNumbers.at(-1) ?? 1) > 1;
	return (
		<div className={styles.matches}>
			{[...matches].reverse().map((b, reverseIndex) => {
				const index = matches.length - 1 - reverseIndex;
				return (
					<Fragment key={keyOf(b)}>
						{showSetDividers && setNumbers[index + 1] !== setNumbers[index] ? (
							<div className={styles.setDivider}>Set {setNumbers[index]}</div>
						) : null}
						{renderMatch(b)}
					</Fragment>
				);
			})}
		</div>
	);
}

function lobbyGroup(lobby: ScannerLobby | null): LobbyGroup {
	if (lobby === "PRIVATE") return "private";
	if (lobby === "X") return "x";
	return "other";
}

/** stable render key for one match: its first source event's id, else its start */
function keyOf(built: BuiltMatch<ScanEvent>): React.Key {
	const first = built.sources[0];
	return first?.id ?? `${first?.type}-${first?.t}`;
}

/** The clips anchored inside the game: from its start to the next game's. */
function clipsOf(
	match: ScannerMatch,
	next: ScannerMatch | undefined,
	clips: readonly ScannerClip[],
): ScannerClip[] {
	if (match.startsAt === null) return [];
	const start = match.startsAt;
	const end = next?.startsAt ?? Number.POSITIVE_INFINITY;
	return clips.filter((clip) => clip.t >= start && clip.t < end);
}

function summaryLine(summary: SessionSummary, clips: number): string {
	const kd = kdRatio(summary);
	return [
		`${summary.games} ${summary.games === 1 ? "game" : "games"}`,
		summary.games > 0 ? `${summary.wins}–${summary.losses}` : null,
		kd !== null ? `K/D ${kd.toFixed(1)}` : null,
		clips > 0 ? `${clips} ${clips === 1 ? "clip" : "clips"}` : null,
	]
		.filter(Boolean)
		.join(" · ");
}

/**
 * Keys of the matches that showed up since the previous render. A list
 * arriving whole (a session loaded from storage) is not "just formed": every
 * card would animate in for something the user did not watch.
 */
function useJustFormedKeys(keys: React.Key[]): ReadonlySet<React.Key> {
	const seenRef = useRef<Set<React.Key> | null>(null);
	const seen = seenRef.current;

	// after commit, not during render: under StrictMode the render runs twice
	// and the second pass would find every key already seen
	useEffect(() => {
		seenRef.current = new Set(keys);
	});

	if (seen === null) return NO_KEYS;
	const justFormed = keys.filter((key) => !seen.has(key));
	return justFormed.length === keys.length && keys.length > 1
		? NO_KEYS
		: new Set(justFormed);
}

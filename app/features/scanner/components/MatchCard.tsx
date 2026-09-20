/**
 * One game of a session or file, the same card in every view. Collapsed it
 * is one row: mode and stage, the result, the POV weapon and K/D/S, then
 * the game's clips and, once the game is over, its upload state beside the
 * expand arrow. Expanded it shows the data and
 * nothing interpreted: the scoreboard, the objective + player-status
 * timeline, deaths and kills (each with a ▶ when a clip covers it) and the
 * builds read for both teams.
 */
import clsx from "clsx";
import { ChevronDown, Play } from "lucide-react";
import { useState } from "react";
import { Ability } from "~/components/Ability";
import { SendouButton } from "~/components/elements/Button";
import { GameTimeline } from "~/components/GameTimeline";
import { ModeImage, WeaponImage } from "~/components/Image";
import { matchScoresFromObjective } from "~/components/objective-timeline-utils";
import { StageBannerBox } from "~/components/StageBannerBox";
import { abilities as ALL_ABILITIES } from "~/modules/in-game-lists/abilities";
import type {
	AbilityWithUnknown,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { clipCovers } from "../core/clips/scoring";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { formatClock, formatPosition } from "../core/format";
import { lobbyLabel, modeLabel, stageLabel, weaponLabel } from "../core/labels";
import type { BuiltMatch } from "../core/match-builder";
import type {
	ScannerMatch,
	ScannerMatchKill,
	ScannerMatchPlayer,
} from "../core/scanner-match";
import { matchResult } from "../core/sessions";
import type { ScannerClip } from "../store/clips";
import type { GetFrame } from "./EventCard";
import styles from "./MatchCard.module.css";
import { playerStatusTeams } from "./player-status-view";
import { RawDetections } from "./RawDetections";
import type { ScanEvent, SessionKind } from "./session-data";
import { type UploadState, UploadStatusButton } from "./UploadStatus";

/** the game score a knockout wins at */
const KO_MATCH_SCORE = 100;

/**
 * Where the match clock starts, to turn a time-left read into time elapsed:
 * Turf War runs 3:00, the ranked modes 5:00 (overtime reads clamp to the end).
 */
const MATCH_CLOCK_SECONDS: Partial<Record<ModeShort, number>> = { TW: 180 };
const DEFAULT_MATCH_CLOCK_SECONDS = 300;

/** The scan knows the on-screen sides only, not who is playing. */
const TEAM_LABELS = ["Alpha", "Bravo"] as const;

const ROW_LABELS = ["head", "clothes", "shoes"] as const;

/** the gear row a slot-only main can only sit in; stackables fit anywhere */
const MAIN_ONLY_ROW = new Map<string, number>(
	ALL_ABILITIES.flatMap((ability): [string, number][] =>
		ability.type === "HEAD_MAIN_ONLY"
			? [[ability.name, 0]]
			: ability.type === "CLOTHES_MAIN_ONLY"
				? [[ability.name, 1]]
				: ability.type === "SHOES_MAIN_ONLY"
					? [[ability.name, 2]]
					: [],
	),
);

const PLAYERS_PER_TEAM = 4;

export function MatchCard({
	built,
	number,
	originT,
	kind,
	justFormed,
	expandable,
	upload,
	clips,
	onPlayClip,
	getFrame,
	debug,
}: {
	built: BuiltMatch<ScanEvent>;
	/** 1-based position in the session, oldest first */
	number: number;
	/** stream/file second positions count from */
	originT: number;
	kind: SessionKind;
	/** the scan just formed this match — play the enter animation */
	justFormed: boolean;
	/** false while the match is still being scanned: no expand button yet */
	expandable: boolean;
	upload: UploadState;
	/** the clips this game produced, best first */
	clips: readonly ScannerClip[];
	onPlayClip: (clip: ScannerClip) => void;
	getFrame: (event: ScanEvent) => GetFrame | undefined;
	debug: boolean;
}) {
	const { match } = built;
	const [expanded, setExpanded] = useState(false);
	// fixed at mount: re-rendering must not cut the animation short
	const [enter] = useState(justFormed);
	const [prevUploadKind, setPrevUploadKind] = useState(upload.kind);
	const [flash, setFlash] = useState<"uploaded" | "failed" | null>(null);
	if (prevUploadKind !== upload.kind) {
		setPrevUploadKind(upload.kind);
		setFlash(
			upload.kind === "uploaded" || upload.kind === "failed"
				? upload.kind
				: null,
		);
	}

	const result = matchResult(match);
	const pov = povPlayer(match);
	const matchOrigin = timelineOrigin(match);
	const meta = [
		kind === "vod" && match.startsAt !== null
			? `at ${formatPosition(match.startsAt - originT)}`
			: null,
		match.lobby !== null && match.lobby !== "PRIVATE"
			? lobbyLabel(match.lobby)
			: null,
		match.replayCode,
		match.cast ? "cast" : null,
	]
		.filter(Boolean)
		.join(" · ");

	const className = clsx(styles.matchCard, {
		[styles.enter]: enter,
		[styles.flashUploaded]: flash === "uploaded",
		[styles.flashFailed]: flash === "failed",
	});

	const head = (
		<div className={styles.head}>
			<div className={styles.main}>
				<span className={styles.number}>Game {number}</span>
				{match.mode !== null ? (
					<ModeImage mode={match.mode} size={26} className={styles.mode} />
				) : null}
				<div className={styles.headline}>
					<div className={styles.title}>
						{modeLabel(match.mode) ? (
							<span className={styles.modeName}>
								{modeLabel(match.mode)} ·{" "}
							</span>
						) : null}
						<span className={styles.stage}>
							{stageLabel(match.stage) ?? "Unknown stage"}
						</span>
					</div>
					{meta ? <div className={styles.meta}>{meta}</div> : null}
				</div>
				<div className={styles.side}>
					<Score match={match} result={result} />
					{pov ? (
						<span className={styles.kds}>
							{pov.ka ?? "?"}/{pov.d ?? "?"}/{pov.s ?? "?"}
						</span>
					) : null}
				</div>
			</div>
			<div className={styles.foot}>
				<TeamWeapons match={match} />
				{clips.length > 0 ? (
					<span className={styles.clips}>
						{clips.map((clip) => (
							<button
								key={clip.id}
								type="button"
								className={styles.clipChip}
								onClick={() => onPlayClip(clip)}
							>
								<Play size={11} aria-hidden />
								{clip.kills}k
								{clip.time !== null
									? ` · ${formatClock(elapsed(match.mode, clip.time))}`
									: null}
							</button>
						))}
					</span>
				) : null}
				{expandable ? (
					<span className={styles.footEnd}>
						<UploadStatusButton state={upload} className={styles.circle} />
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<ChevronDown />}
							className={clsx(styles.circle, styles.expand, {
								[styles.expanded]: expanded,
							})}
							aria-expanded={expanded}
							aria-label={expanded ? "Hide details" : "Show details"}
							onClick={() => setExpanded(!expanded)}
						/>
					</span>
				) : null}
			</div>
		</div>
	);

	const card =
		match.stage !== null ? (
			<StageBannerBox stageId={match.stage} className={className}>
				{head}
			</StageBannerBox>
		) : (
			<div className={className}>{head}</div>
		);

	return (
		<div className={styles.group}>
			{card}
			{expanded && expandable ? (
				<div className={styles.details}>
					<Scoreboard match={match} result={result} />
					<Builds match={match} />
					{match.objective || match.playerStatus ? (
						<GameTimeline
							objectiveEvents={(match.objective?.samples ?? []).map(
								(sample) => ({ t: sample.t - matchOrigin, data: sample }),
							)}
							playerStatusSamples={(match.playerStatus?.samples ?? []).map(
								(sample) => ({ ...sample, t: sample.t - matchOrigin }),
							)}
							teams={playerStatusTeams(match, TEAM_LABELS)}
						/>
					) : null}
					<DeathsAndKills built={built} clips={clips} onPlayClip={onPlayClip} />
					{debug ? (
						<RawDetections sources={built.sources} getFrame={getFrame} />
					) : null}
				</div>
			) : null}
		</div>
	);
}

/**
 * Live sessions stamp reads with wall-clock seconds and VoDs with file position;
 * the timeline charts want seconds since the match began either way.
 */
function timelineOrigin(match: ScannerMatch): number {
	return (
		match.startsAt ??
		match.objective?.samples[0]?.t ??
		match.playerStatus?.samples[0]?.t ??
		0
	);
}

function povPlayer(match: ScannerMatch): ScannerMatchPlayer | undefined {
	return match.pov
		? match.teams[match.pov.team].players[match.pov.index]
		: undefined;
}

/** time elapsed on the match clock from a time-left reading */
function elapsed(mode: ModeShort | null, timeLeft: number): number {
	const clockStart =
		(mode !== null ? MATCH_CLOCK_SECONDS[mode] : undefined) ??
		DEFAULT_MATCH_CLOCK_SECONDS;
	return Math.max(0, clockStart - timeLeft);
}

/**
 * `teams` order is winner-first on a scoreboard-closed match, so it flips
 * between games. The card keeps the scan's own side left and the enemy right
 * for every match so consecutive games line up; footage with no POV seat
 * read (casts) keeps `teams` order.
 */
function displayOrder(match: ScannerMatch): [0 | 1, 0 | 1] {
	return match.pov?.team === 1 ? [1, 0] : [0, 1];
}

function Score({
	match,
	result,
}: {
	match: ScannerMatch;
	result: "win" | "loss" | null;
}) {
	if (match.matchScores === null && match.winner === null) return null;
	const objectiveScores = matchScoresFromObjective(
		match.objective?.samples ?? [],
	);
	const [left, right] = displayOrder(match);
	const scores = match.matchScores ?? [null, null];
	return (
		<span className={styles.score}>
			{result ? (
				<span className={result === "win" ? styles.win : styles.loss}>
					{result === "win" ? "WIN" : "LOSS"}
				</span>
			) : null}
			{match.matchScores !== null || objectiveScores.some((s) => s !== null) ? (
				<span className={styles.scoreNumbers}>
					{scoreLabel(scores[left], objectiveScores[left])}
					<span className={styles.scoreDash}>–</span>
					{scoreLabel(scores[right], objectiveScores[right])}
				</span>
			) : null}
		</span>
	);
}

/**
 * A 100 only happens on a knockout, shown the way players say it. A knockout's
 * loser gets no score, so the objective counter's last read stands in —
 * parenthesized, since the scan may have lost sight of the counter early.
 */
function scoreLabel(
	score: number | null,
	objectiveScore: number | null,
): string {
	if (score !== null && score > 0) {
		return score === KO_MATCH_SCORE ? "KO" : String(score);
	}
	if (objectiveScore !== null) {
		return objectiveScore === KO_MATCH_SCORE ? "(KO)" : `(${objectiveScore})`;
	}
	return score === null ? "?" : String(score);
}

/** Both teams' weapons, always four a side: a slot the scan never read shows a ?. */
function TeamWeapons({ match }: { match: ScannerMatch }) {
	const [left, right] = displayOrder(match);
	return (
		<span className={styles.teamWeapons}>
			{[left, right].map((team, side) => (
				<span key={team} className={styles.weaponRow}>
					{side === 1 ? <span className={styles.vs}>vs</span> : null}
					{Array.from({ length: PLAYERS_PER_TEAM }, (_, index) => {
						const weaponId = match.teams[team].players[index]?.weaponId ?? null;
						const isPov = match.pov?.team === team && match.pov.index === index;
						return weaponId !== null ? (
							<WeaponImage
								key={index}
								weaponSplId={weaponId}
								variant="build"
								size={24}
								className={clsx(styles.weapon, { [styles.pov]: isPov })}
							/>
						) : (
							<span
								key={index}
								className={clsx(styles.weapon, styles.weaponUnknown, {
									[styles.pov]: isPov,
								})}
								title="weapon not read"
							>
								?
							</span>
						);
					})}
				</span>
			))}
		</span>
	);
}

function Scoreboard({
	match,
	result,
}: {
	match: ScannerMatch;
	result: "win" | "loss" | null;
}) {
	if (match.teams.every((team) => team.players.length === 0)) return null;
	const [left, right] = displayOrder(match);
	return (
		<div className={styles.scoreboard}>
			{[left, right].map((team) => (
				<div
					key={team}
					className={clsx(styles.team, {
						[styles.teamWin]: match.winner === team,
						[styles.teamLoss]: match.winner !== null && match.winner !== team,
					})}
				>
					<div className={styles.teamHeading}>
						{TEAM_LABELS[team]}
						{match.winner === team ? " · WIN" : null}
						{result === null && match.pov?.team === team ? " · you" : null}
					</div>
					<table className={styles.players}>
						<tbody>
							{match.teams[team].players.map((player, index) => {
								const isPov =
									match.pov?.team === team && match.pov.index === index;
								return (
									<tr key={index} className={clsx({ [styles.pov]: isPov })}>
										<td className={styles.weaponCell}>
											{player.weaponId !== null ? (
												<WeaponImage
													weaponSplId={player.weaponId}
													variant="build"
													size={24}
													className={clsx(styles.weapon, {
														[styles.pov]: isPov,
													})}
												/>
											) : (
												<span
													className={clsx(styles.weapon, styles.weaponUnknown, {
														[styles.pov]: isPov,
													})}
													title="weapon not read"
												>
													?
												</span>
											)}
										</td>
										<td className={styles.name}>
											{isPov ? "▸ " : null}
											{player.name ?? "?"}
										</td>
										<td className={styles.num}>
											{player.ka ?? "?"}/{player.d ?? "?"}/{player.s ?? "?"}
										</td>
										<td className={styles.num}>
											{player.paint !== null ? `${player.paint}p` : ""}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			))}
		</div>
	);
}

interface DeathRow {
	t: number;
	timeLeft: number | null;
	label: string;
}

/** The POV player's deaths (off the death overlays) and kills (off the kill feed), each with its clip. */
function DeathsAndKills({
	built,
	clips,
	onPlayClip,
}: {
	built: BuiltMatch<ScanEvent>;
	clips: readonly ScannerClip[];
	onPlayClip: (clip: ScannerClip) => void;
}) {
	const { match } = built;
	const deaths: DeathRow[] = built.sources
		.filter((event) => event.type === DEATH_EVENT_TYPE)
		.map((event) => {
			const data = event.data as DeathData;
			return {
				t: event.t,
				timeLeft: matchClockAt(match, event.t),
				label: weaponLabel(data.weaponType, data.weaponId) ?? data.name ?? "?",
			};
		});
	const kills = match.kills ?? [];
	if (deaths.length === 0 && kills.length === 0) return null;
	const clipAt = (t: number) => clips.find((clip) => clipCovers(clip, t));

	return (
		<div className={styles.deathsKills}>
			<div className={styles.column}>
				<div className={styles.columnHeading}>Deaths · {deaths.length}</div>
				{deaths.map((death, i) => (
					<div key={i} className={styles.row}>
						<span className={styles.clock}>
							{death.timeLeft !== null
								? formatClock(elapsed(match.mode, death.timeLeft))
								: "–:––"}
						</span>
						<span className={styles.rowLabel}>{death.label}</span>
						<PlayButton clip={clipAt(death.t)} onPlayClip={onPlayClip} />
					</div>
				))}
			</div>
			<div className={styles.column}>
				<div className={styles.columnHeading}>Kills · {kills.length}</div>
				{groupKills(kills).map((group, i) => (
					<div key={i} className={styles.row}>
						<span className={styles.clock}>
							{group[0]!.time !== null
								? formatClock(elapsed(match.mode, group[0]!.time))
								: "–:––"}
						</span>
						<span className={styles.rowLabel}>
							{group.map((kill) => kill.name ?? "?").join(" · ")}
							{group.length > 1 ? (
								<span className={styles.streak}> {group.length}k</span>
							) : null}
						</span>
						<PlayButton
							clip={clipAt(group.at(-1)!.t)}
							onPlayClip={onPlayClip}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

/** kills within a few seconds of each other read as one line */
const KILL_GROUP_GAP_S = 6;

function groupKills(kills: readonly ScannerMatchKill[]): ScannerMatchKill[][] {
	const groups: ScannerMatchKill[][] = [];
	for (const kill of kills) {
		const group = groups.at(-1);
		if (group && kill.t - group.at(-1)!.t <= KILL_GROUP_GAP_S) group.push(kill);
		else groups.push([kill]);
	}
	return groups;
}

function PlayButton({
	clip,
	onPlayClip,
}: {
	clip: ScannerClip | undefined;
	onPlayClip: (clip: ScannerClip) => void;
}) {
	if (!clip) return <span className={styles.playSlot} />;
	return (
		<button
			type="button"
			className={clsx(styles.playSlot, styles.playButton)}
			aria-label="Play clip"
			onClick={() => onPlayClip(clip)}
		>
			<Play size={12} aria-hidden />
		</button>
	);
}

/**
 * The match timer's reading at stream time `t`, projected from the nearest
 * read that carried one (counter, status strip or kill feed); null when the
 * match had no timed read.
 */
function matchClockAt(match: ScannerMatch, t: number): number | null {
	const timed = [
		...(match.objective?.samples ?? []),
		...(match.playerStatus?.samples ?? []),
		...(match.kills ?? []),
	].filter((sample) => sample.time !== null);
	if (timed.length === 0) return null;
	const nearest = timed.reduce((best, sample) =>
		Math.abs(sample.t - t) < Math.abs(best.t - t) ? sample : best,
	);
	return Math.max(0, nearest.time! - (t - nearest.t));
}

/**
 * Builds cover both teams: the POV player's full gear comes from the
 * personal-results screen, an enemy's full grid from the death overlay when
 * they splatted you, and everyone else's mains from the minimap cards. A row
 * renders as far as it was read, with unread slots blank.
 */
function Builds({ match }: { match: ScannerMatch }) {
	const [left, right] = displayOrder(match);
	const players = [left, right].flatMap((team) =>
		match.teams[team].players
			.map((player, index) => ({
				player,
				isPov: match.pov?.team === team && match.pov.index === index,
			}))
			.filter(({ player }) => player.abilities && player.abilities.length > 0),
	);
	if (players.length === 0) return null;
	return (
		<div className={styles.builds}>
			<div className={styles.columnHeading}>Builds</div>
			<div className={styles.buildGrid}>
				{players.map(({ player, isPov }, i) => (
					<div key={i} className={styles.build}>
						<div className={styles.buildHead}>
							{player.weaponId !== null ? (
								<WeaponImage
									weaponSplId={player.weaponId}
									variant="build"
									size={22}
								/>
							) : null}
							<span className={styles.buildName}>
								{isPov ? "You" : (player.name ?? "?")}
							</span>
						</div>
						<BuildRows abilities={player.abilities!} />
					</div>
				))}
			</div>
		</div>
	);
}

function BuildRows({ abilities }: { abilities: AbilityWithUnknown[][] }) {
	const rows = gearRows(abilities);
	return (
		<div className={styles.buildRows}>
			{ROW_LABELS.map((label, row) => (
				<div key={label} className={styles.buildRow}>
					{(rows[row] ?? []).map((ability, slot) => (
						<Ability
							key={slot}
							ability={ability}
							size={slot === 0 ? "SUBTINY" : "TINY"}
						/>
					))}
				</div>
			))}
		</div>
	);
}

/**
 * Rows in head/clothes/shoes order. A read lists rows as they were seen, but
 * a slot-only main (Respawn Punisher is clothes only, Stealth Jump shoes
 * only) pins its row to that gear; the other rows take the free slots in
 * their read order.
 */
function gearRows(
	abilities: readonly AbilityWithUnknown[][],
): (AbilityWithUnknown[] | undefined)[] {
	const rows: (AbilityWithUnknown[] | undefined)[] = [
		undefined,
		undefined,
		undefined,
	];
	const loose: AbilityWithUnknown[][] = [];
	for (const row of abilities.slice(0, ROW_LABELS.length)) {
		const pinned = row[0] === undefined ? undefined : MAIN_ONLY_ROW.get(row[0]);
		if (pinned !== undefined && rows[pinned] === undefined) rows[pinned] = row;
		else loose.push(row);
	}
	for (const row of loose) {
		const free = rows.indexOf(undefined);
		if (free === -1) break;
		rows[free] = row;
	}
	return rows;
}

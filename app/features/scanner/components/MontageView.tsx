/**
 * Dev-only tournament montage builder: open a tournament's VoD folder, scan
 * it, then pick clips — the best first, filterable by team — for the top
 * teams and render one video: the intro card, then each top team counting
 * down to the winner, its card followed by its clips. The cards can be
 * previewed on the page. The work itself lives in `montage.ts`; a reload
 * restores the latest montage, and scanning, previews and rendering wait
 * for its folder to be reconnected.
 */
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	ChevronsDownUp,
	ChevronsUpDown,
	Film,
	FolderOpen,
	ImageDown,
	Music,
	Play,
	Plus,
	RefreshCw,
	RotateCcw,
	ScanSearch,
	Square,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { WeaponImage } from "~/components/Image";
import { Placement } from "~/components/Placement";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import { formatPosition } from "../core/format";
import { mainWeaponLabel, modeLabel, stageLabel } from "../core/labels";
import {
	candidatesByBaseWeapon,
	MONTAGE_KILL_COUNTS,
	MONTAGE_MAX_SECONDS_OPTIONS,
	type MontageCandidate,
	type MontageManifestTopTeam,
	type MontageManifestVod,
	maxSecondsFor,
	montageDuration,
	montageTeamSections,
} from "../core/montage";
import { montageCollapsedGroupsPersisted } from "../scanner-persisted";
import { ClipVideo } from "./ClipVideo";
import {
	type MontageCard,
	MontageCardPreview,
	MontageGraphicStage,
	MontageRibbonPreview,
} from "./MontageGraphics";
import styles from "./MontageView.module.css";
import {
	availableCandidates,
	cancelMontageRender,
	cancelMontageScan,
	candidatePreview,
	candidatePreviewFrame,
	candidateThumbnail,
	downloadMontageGraphic,
	type MontageGraphic,
	type MontageSnapshot,
	montageImageUrl,
	montageTeamComps,
	movePick,
	openMontageFolder,
	pickCandidate,
	reconnectMontageFolder,
	renderMontageVideo,
	scanMontageVods,
	setMontageMusic,
	unpickCandidate,
	updateMontageCriteria,
	useMontage,
} from "./montage";
import { ScanWorkers } from "./ScanWorkers";
import { SessionHeader } from "./SessionHeader";
import { useVodScan } from "./vod-scan";

export function MontageView() {
	const montage = useMontage();
	const disconnected = montage.folder !== null && !montage.folder.files;

	return (
		<div className={styles.view}>
			<SessionHeader
				actions={
					<>
						{disconnected && montage.folder?.directory ? (
							<SendouButton
								size="small"
								icon={<RefreshCw />}
								onClick={() => void reconnectMontageFolder()}
							>
								Reconnect folder
							</SendouButton>
						) : null}
						{montage.folder?.files ? (
							<GraphicDownloadButton
								graphic={{ kind: "results" }}
								name="results"
							>
								Results image
							</GraphicDownloadButton>
						) : null}
						<SendouButton
							size="small"
							variant={disconnected ? "outlined" : "primary"}
							icon={<FolderOpen />}
							onClick={() => void openMontageFolder()}
						>
							Open folder
						</SendouButton>
					</>
				}
			>
				<div className={styles.title}>
					Tournament montage
					{montage.folder ? ` · ${montage.folder.manifest.name}` : null}
				</div>
				{montage.folder ? null : (
					<p className={styles.note}>
						Download the VoDs with <code>pnpm vods:download &lt;id&gt;</code>,
						then open <code>scripts/output/vods/&lt;id&gt;</code>.
					</p>
				)}
				{disconnected ? (
					<p className={styles.note}>
						Restored from the last visit: reconnect the folder to scan, watch
						and render clips.
					</p>
				) : null}
				{montage.folderError ? (
					<p className={styles.error}>{montage.folderError}</p>
				) : null}
			</SessionHeader>
			{montage.folder ? (
				<>
					<ScanPanel montage={montage} />
					<CardsPanel montage={montage} />
					<PicksPanel montage={montage} />
					<CandidatesPanel montage={montage} />
					<MontageGraphicStage
						manifest={montage.folder.manifest}
						comps={montageTeamComps(montage)}
					/>
				</>
			) : null}
		</div>
	);
}

/** Downloads the graphic as captured for the video. */
function GraphicDownloadButton({
	graphic,
	name,
	isDisabled = false,
	children,
}: {
	graphic: MontageGraphic;
	name: string;
	isDisabled?: boolean;
	children: React.ReactNode;
}) {
	const [state, setState] = useState<"idle" | "capturing" | "failed">("idle");

	const download = async () => {
		setState("capturing");
		try {
			await downloadMontageGraphic(graphic, name);
			setState("idle");
		} catch {
			setState("failed");
		}
	};

	return (
		<SendouButton
			size="small"
			variant="outlined"
			icon={<ImageDown />}
			isDisabled={isDisabled || state === "capturing"}
			onClick={() => void download()}
		>
			{state === "failed" ? "Failed, retry" : children}
		</SendouButton>
	);
}

/** The video's cards as they are, to tweak them by. */
function CardsPanel({ montage }: { montage: MontageSnapshot }) {
	const [cardKey, setCardKey] = useState("intro");
	const [replayCount, setReplayCount] = useState(0);
	const manifest = montage.folder!.manifest;
	const teams = manifest.topTeams.toReversed();
	const team = teams.find((candidate) => String(candidate.id) === cardKey);
	const card: MontageCard = team
		? { kind: "team", teamId: team.id }
		: { kind: "intro" };
	const ribbonSample = montage.picks[0] ?? availableCandidates(montage)[0];
	const ribbonVod =
		ribbonSample?.vod ??
		manifest.vods.find((vod) => vod.pov) ??
		manifest.vods[0];
	const showsRibbon = cardKey === "ribbon" && ribbonVod !== undefined;
	const graphic: MontageGraphic = showsRibbon
		? {
				kind: "ribbon",
				vod: ribbonVod,
				weaponId: ribbonSample?.weaponId ?? null,
			}
		: card;

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<span className={styles.panelTitle}>Cards</span>
				<SendouButton
					size="small"
					variant="minimal"
					icon={<RotateCcw />}
					className="ml-auto"
					onClick={() => setReplayCount((count) => count + 1)}
				>
					Replay
				</SendouButton>
				<GraphicDownloadButton
					graphic={graphic}
					name={showsRibbon ? "ribbon" : team ? `team-${team.id}` : "intro"}
					isDisabled={!montage.folder?.files}
				>
					PNG
				</GraphicDownloadButton>
			</div>
			<SendouChipRadioGroup wrap>
				<SendouChipRadio
					name="montage-card"
					value="intro"
					checked={cardKey === "intro"}
					onChange={setCardKey}
				>
					Intro
				</SendouChipRadio>
				{teams.map((candidate) => (
					<SendouChipRadio
						key={candidate.id}
						name="montage-card"
						value={String(candidate.id)}
						checked={candidate === team}
						onChange={setCardKey}
					>
						<Placement placement={candidate.placement} plain /> {candidate.name}
					</SendouChipRadio>
				))}
				{ribbonVod ? (
					<SendouChipRadio
						name="montage-card"
						value="ribbon"
						checked={showsRibbon}
						onChange={setCardKey}
					>
						POV ribbon
					</SendouChipRadio>
				) : null}
			</SendouChipRadioGroup>
			{showsRibbon ? (
				<RibbonPreview
					key={replayCount}
					sample={ribbonSample}
					vod={ribbonVod}
				/>
			) : (
				<MontageCardPreview
					key={`${cardKey}-${replayCount}`}
					card={card}
					manifest={manifest}
					comps={montageTeamComps(montage)}
				/>
			)}
		</section>
	);
}

/** The ribbon over the sample clip's frame (the first pick or best candidate), when there is one. */
function RibbonPreview({
	sample,
	vod,
}: {
	sample: MontageCandidate | undefined;
	vod: MontageManifestVod;
}) {
	const background = useCandidateFrame(sample, candidatePreviewFrame);

	return (
		<MontageRibbonPreview
			vod={vod}
			weaponId={sample?.weaponId ?? null}
			background={background}
		/>
	);
}

function ScanPanel({ montage }: { montage: MontageSnapshot }) {
	const vodScan = useVodScan();
	const vods = montage.folder?.vods ?? [];
	const scannedCount = vods.filter((vod) =>
		montage.scanned.has(vod.file),
	).length;
	const unscanned = vods.length - scannedCount;
	const scan = montage.scan;

	if (scan?.state === "scanning") {
		return (
			<section className={styles.panel}>
				<div className={styles.panelHeader}>
					<span className={styles.panelTitle}>
						Scanning VoD {scan.index + 1}/{scan.total} · {scan.file}
					</span>
					<SendouButton
						size="small"
						variant="minimal-destructive"
						icon={<Square />}
						onClick={cancelMontageScan}
					>
						Stop
					</SendouButton>
				</div>
				<ScanWorkers events={vodScan.events}>
					{vodScan.error ? (
						<p className={styles.error}>{vodScan.error}</p>
					) : null}
				</ScanWorkers>
			</section>
		);
	}

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<span className={styles.panelTitle}>
					{scannedCount}/{vods.length} VoDs scanned
				</span>
				{unscanned > 0 ? (
					<SendouButton
						size="small"
						icon={<ScanSearch />}
						isDisabled={!montage.folder?.files}
						onClick={() => void scanMontageVods()}
					>
						Scan {unscanned} {unscanned === 1 ? "VoD" : "VoDs"}
					</SendouButton>
				) : null}
			</div>
			{scan?.state === "done" && scan.failed.length > 0 ? (
				<p className={styles.error}>Failed to scan: {scan.failed.join(", ")}</p>
			) : null}
		</section>
	);
}

function PicksPanel({ montage }: { montage: MontageSnapshot }) {
	const picks = montage.picks;
	const render = montage.render;
	const rendering = render?.state === "rendering";
	const topTeams = montage.folder?.manifest.topTeams ?? [];

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<span className={styles.panelTitle}>
					Montage · {picks.length} {picks.length === 1 ? "clip" : "clips"} ·{" "}
					{formatPosition(montageDuration(topTeams.length, picks))}
				</span>
				{rendering ? (
					<SendouButton
						size="small"
						variant="minimal-destructive"
						icon={<Square />}
						onClick={cancelMontageRender}
					>
						Cancel
					</SendouButton>
				) : (
					<SendouButton
						size="small"
						icon={<Film />}
						isDisabled={!montage.folder?.files}
						onClick={() => void renderMontageVideo()}
					>
						Render video
					</SendouButton>
				)}
			</div>
			{rendering ? (
				<div className={styles.renderProgress}>
					<progress value={render.done} max={Math.max(1, render.total)} />
					<span>
						{formatPosition(render.done)} / {formatPosition(render.total)}
					</span>
				</div>
			) : render?.state === "done" ? (
				render.error ? (
					<p className={styles.error}>{render.error}</p>
				) : (
					<p className={styles.note}>Rendered.</p>
				)
			) : null}
			<MusicPicker music={montage.music} isDisabled={rendering} />
			<p className={styles.note}>
				The intro, then the top {topTeams.length} counting down to the winner:
				each team's card, then its clips in this order.
			</p>
			{montageTeamSections(topTeams, picks).map((section) => (
				<div key={section.team.id} className={styles.teamSection}>
					<TeamLabel team={section.team} />
					{section.picks.length === 0 ? (
						<p className={styles.note}>No clips, only the card</p>
					) : (
						<ol className={styles.picks}>
							{section.picks.map((pick, i) => (
								<li key={pick.key} className={styles.pick}>
									<span className={styles.pickIndex}>{i + 1}</span>
									<CandidateSummary candidate={pick} />
									<span className={styles.pickActions}>
										<SendouButton
											size="small"
											variant="minimal"
											shape="circle"
											icon={<ArrowUp />}
											aria-label="Move earlier"
											isDisabled={rendering || i === 0}
											onClick={() => movePick(pick.key, -1)}
										/>
										<SendouButton
											size="small"
											variant="minimal"
											shape="circle"
											icon={<ArrowDown />}
											aria-label="Move later"
											isDisabled={rendering || i === section.picks.length - 1}
											onClick={() => movePick(pick.key, 1)}
										/>
										<SendouButton
											size="small"
											variant="minimal-destructive"
											shape="circle"
											icon={<X />}
											aria-label="Remove from montage"
											isDisabled={rendering}
											onClick={() => unpickCandidate(pick.key)}
										/>
									</span>
								</li>
							))}
						</ol>
					)}
				</div>
			))}
		</section>
	);
}

function TeamLabel({ team }: { team: MontageManifestTopTeam }) {
	return (
		<span className={styles.teamLabel}>
			<span className={styles.teamPlacement}>
				<Placement placement={team.placement} plain />
			</span>
			<Avatar
				url={montageImageUrl(team.logo)}
				identiconInput={team.name}
				size="xxxsm"
			/>
			{team.name}
		</span>
	);
}

/** Optional: a music or video file whose sound replaces the game sound. */
function MusicPicker({
	music,
	isDisabled,
}: {
	music: File | null;
	isDisabled: boolean;
}) {
	return (
		<div className={styles.music}>
			<span className={styles.criterionLabel}>Music</span>
			{music ? (
				<>
					<Music size={14} aria-hidden />
					<span className={styles.musicName}>{music.name}</span>
					<SendouButton
						size="small"
						variant="minimal-destructive"
						shape="circle"
						icon={<X />}
						aria-label="Remove music"
						isDisabled={isDisabled}
						onClick={() => setMontageMusic(null)}
					/>
				</>
			) : (
				<>
					<label className={styles.musicButton}>
						Choose file
						<input
							type="file"
							accept="audio/*,video/*"
							disabled={isDisabled}
							onChange={(e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (file) setMontageMusic(file);
							}}
						/>
					</label>
					<span className={styles.note}>optional, replaces the game sound</span>
				</>
			)}
		</div>
	);
}

function CandidatesPanel({ montage }: { montage: MontageSnapshot }) {
	const [teamFilter, setTeamFilter] = useState<number | null>(null);
	const topTeams = montage.folder?.manifest.topTeams ?? [];
	const available = availableCandidates(montage);
	const candidates =
		teamFilter === null
			? available
			: available.filter((candidate) => candidate.teamIds.includes(teamFilter));
	const groups = candidatesByBaseWeapon(candidates);
	const [collapsedGroups, setCollapsedGroups] = usePersistedState(
		montageCollapsedGroupsPersisted,
	);
	const collapsed = new Set(collapsedGroups);
	const allCollapsed =
		groups.length > 0 &&
		groups.every((group) => collapsed.has(String(group.baseWeaponId)));

	const toggleGroups = (groupKeys: string[], expand: boolean) => {
		const next = new Set(collapsed);
		for (const groupKey of groupKeys) {
			if (expand) next.delete(groupKey);
			else next.add(groupKey);
		}
		setCollapsedGroups([...next]);
	};

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<span className={styles.panelTitle}>Clips · {candidates.length}</span>
				{groups.length > 0 ? (
					<SendouButton
						size="small"
						variant="minimal"
						icon={allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
						onClick={() =>
							toggleGroups(
								groups.map((group) => String(group.baseWeaponId)),
								allCollapsed,
							)
						}
					>
						{allCollapsed ? "Expand all" : "Collapse all"}
					</SendouButton>
				) : null}
			</div>
			<div className={styles.criteria}>
				<span className={styles.criterion}>
					<span className={styles.criterionLabel}>Team</span>
					<SendouChipRadioGroup wrap>
						<SendouChipRadio
							name="montage-team-filter"
							value="all"
							checked={teamFilter === null}
							onChange={() => setTeamFilter(null)}
						>
							All · {available.length}
						</SendouChipRadio>
						{topTeams.map((team) => (
							<SendouChipRadio
								key={team.id}
								name="montage-team-filter"
								value={String(team.id)}
								checked={teamFilter === team.id}
								onChange={() => setTeamFilter(team.id)}
							>
								{team.name} ·{" "}
								{
									available.filter((candidate) =>
										candidate.teamIds.includes(team.id),
									).length
								}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				</span>
				<span className={styles.criterion}>
					<span className={styles.criterionLabel}>Min splats</span>
					<SendouChipRadioGroup>
						{MONTAGE_KILL_COUNTS.map((kills) => (
							<SendouChipRadio
								key={kills}
								name="montage-min-kills"
								value={String(kills)}
								checked={montage.criteria.minKills === kills}
								onChange={() => updateMontageCriteria({ minKills: kills })}
							>
								{kills}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				</span>
				{MONTAGE_KILL_COUNTS.filter(
					(kills) => kills >= montage.criteria.minKills,
				).map((kills) => (
					<span key={kills} className={styles.criterion}>
						<span className={styles.criterionLabel}>
							{kills === MONTAGE_KILL_COUNTS.at(-1) ? `${kills}+` : kills}{" "}
							splats, max
						</span>
						<SendouChipRadioGroup>
							{MONTAGE_MAX_SECONDS_OPTIONS.map((seconds) => (
								<SendouChipRadio
									key={seconds}
									name={`montage-max-seconds-${kills}`}
									value={String(seconds)}
									checked={maxSecondsFor(montage.criteria, kills) === seconds}
									onChange={() =>
										updateMontageCriteria({
											maxSecondsByKills: {
												...montage.criteria.maxSecondsByKills,
												[kills]: seconds,
											},
										})
									}
								>
									{seconds}s
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					</span>
				))}
			</div>
			{candidates.length === 0 ? (
				<p className={styles.note}>
					{montage.candidates.length === 0
						? "No clips yet: they appear as VoDs are scanned."
						: "No clips left to pick."}
				</p>
			) : (
				groups.map((group) => {
					const groupKey = String(group.baseWeaponId);
					const isCollapsed = collapsed.has(groupKey);

					return (
						<div key={groupKey} className={styles.group}>
							<button
								type="button"
								className={styles.groupTitle}
								aria-expanded={!isCollapsed}
								onClick={() => toggleGroups([groupKey], isCollapsed)}
							>
								{isCollapsed ? (
									<ChevronRight size={16} aria-hidden />
								) : (
									<ChevronDown size={16} aria-hidden />
								)}
								{group.baseWeaponId === null ? null : (
									<WeaponImage
										weaponSplId={group.baseWeaponId}
										variant="badge"
										size={28}
									/>
								)}
								{mainWeaponLabel(group.baseWeaponId) ?? "Unknown weapon"}
								<span className={styles.groupCount}>
									{group.candidates.length}
								</span>
							</button>
							{isCollapsed ? null : (
								<div className={styles.grid}>
									{group.candidates.map((candidate) => (
										<CandidateCard
											key={candidate.key}
											candidate={candidate}
											teams={topTeams.filter((team) =>
												teamFilter === null
													? candidate.teamIds.includes(team.id)
													: team.id === teamFilter,
											)}
											isDisabled={montage.render?.state === "rendering"}
										/>
									))}
								</div>
							)}
						</div>
					);
				})
			)}
		</section>
	);
}

function CandidateCard({
	candidate,
	teams,
	isDisabled,
}: {
	candidate: MontageCandidate;
	/** the teams it can be added under, a button each */
	teams: MontageManifestTopTeam[];
	isDisabled: boolean;
}) {
	const thumbnail = useCandidateFrame(candidate, candidateThumbnail);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	// the preview's URL is released with the card
	useEffect(
		() => () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		},
		[previewUrl],
	);

	const play = async () => {
		const blob = await candidatePreview(candidate);
		if (blob) setPreviewUrl(URL.createObjectURL(blob));
	};

	return (
		<div className={styles.card}>
			{previewUrl ? (
				<ClipVideo className={styles.video} src={previewUrl} />
			) : (
				<button
					type="button"
					className={styles.thumb}
					style={
						thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined
					}
					onClick={() => void play()}
					aria-label="Play clip"
				>
					<span className={styles.playBadge}>
						<Play size={18} aria-hidden />
					</span>
				</button>
			)}
			<div className={styles.cardBody}>
				<CandidateSummary candidate={candidate} />
				<span className={styles.addButtons}>
					{teams.map((team) => (
						<SendouButton
							key={team.id}
							size="small"
							variant="outlined"
							icon={<Plus />}
							isDisabled={isDisabled}
							onClick={() => pickCandidate(candidate, team.id)}
						>
							{teams.length === 1 ? "Add" : team.name}
						</SendouButton>
					))}
				</span>
			</div>
		</div>
	);
}

function CandidateSummary({ candidate }: { candidate: MontageCandidate }) {
	const { window, vod } = candidate;
	const where = [modeLabel(candidate.mode), stageLabel(candidate.stage)]
		.filter(Boolean)
		.join(" · ");

	return (
		<span className={styles.summary}>
			<span className={styles.summaryTitle}>
				{candidate.weaponId === null ||
				candidate.weaponId === undefined ? null : (
					<WeaponImage
						weaponSplId={candidate.weaponId}
						variant="badge"
						size={20}
					/>
				)}
				{window.kills} splats · {vod.team?.name ?? "Cast"}
			</span>
			<span className={styles.summaryMeta}>
				{formatPosition(candidate.duration)}
				{candidate.duration < window.end - window.start
					? ` (${formatPosition(window.end - window.start)} raw)`
					: null}
				{where ? ` · ${where}` : null} · {vod.account} · match {vod.matchId}
			</span>
		</span>
	);
}

/** A frame of the candidate once decoded (they queue up, one VoD open at a time). */
function useCandidateFrame(
	candidate: MontageCandidate | undefined,
	decode: (candidate: MontageCandidate) => Promise<string | null>,
): string | null {
	const [frame, setFrame] = useState<string | null>(null);

	// decoding a frame is async work outside React
	useEffect(() => {
		if (!candidate) return;
		let stale = false;
		void decode(candidate).then((next) => {
			if (!stale) setFrame(next);
		});
		return () => {
			stale = true;
		};
	}, [candidate, decode]);

	return frame;
}

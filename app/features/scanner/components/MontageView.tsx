/**
 * Dev-only tournament montage builder: open a tournament's VoD folder, scan
 * it, then pick clips one by one — the best first, a picked team's other
 * clips hidden — and render them into one video between a title card and
 * the top 8. The work itself lives in `montage.ts`; a reload restores the
 * latest montage, and scanning, previews and rendering wait for its folder
 * to be reconnected.
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
	ScanSearch,
	Square,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { WeaponImage } from "~/components/Image";
import { formatPosition } from "../core/format";
import { mainWeaponLabel, modeLabel, stageLabel } from "../core/labels";
import {
	candidatesByBaseWeapon,
	MONTAGE_KILL_COUNTS,
	MONTAGE_MAX_SECONDS_OPTIONS,
	type MontageCandidate,
	maxSecondsFor,
} from "../core/montage";
import { ClipVideo } from "./ClipVideo";
import { MontageGraphicStage } from "./MontageGraphics";
import styles from "./MontageView.module.css";
import {
	availableCandidates,
	cancelMontageRender,
	cancelMontageScan,
	candidatePreview,
	candidateThumbnail,
	downloadMontageResults,
	type MontageSnapshot,
	montageDuration,
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

const COLLAPSED_GROUPS_STORAGE_KEY = "scanner:montage-collapsed-groups";

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
						{montage.folder?.files ? <ResultsImageButton /> : null}
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

function ResultsImageButton() {
	const [state, setState] = useState<"idle" | "capturing" | "failed">("idle");

	const download = async () => {
		setState("capturing");
		try {
			await downloadMontageResults();
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
			isDisabled={state === "capturing"}
			onClick={() => void download()}
		>
			{state === "failed" ? "Results image failed, retry" : "Results image"}
		</SendouButton>
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

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<span className={styles.panelTitle}>
					Montage · {picks.length} {picks.length === 1 ? "clip" : "clips"} ·{" "}
					{formatPosition(montageDuration(picks))}
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
						isDisabled={picks.length === 0 || !montage.folder?.files}
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
			{picks.length === 0 ? (
				<p className={styles.note}>
					Pick clips below; they play in this order, between the title card and
					the top {montage.folder?.manifest.topTeams.length}.
				</p>
			) : (
				<ol className={styles.picks}>
					{picks.map((candidate, i) => (
						<li key={candidate.key} className={styles.pick}>
							<span className={styles.pickIndex}>{i + 1}</span>
							<CandidateSummary candidate={candidate} />
							<span className={styles.pickActions}>
								<SendouButton
									size="small"
									variant="minimal"
									shape="circle"
									icon={<ArrowUp />}
									aria-label="Move earlier"
									isDisabled={rendering || i === 0}
									onClick={() => movePick(candidate.key, -1)}
								/>
								<SendouButton
									size="small"
									variant="minimal"
									shape="circle"
									icon={<ArrowDown />}
									aria-label="Move later"
									isDisabled={rendering || i === picks.length - 1}
									onClick={() => movePick(candidate.key, 1)}
								/>
								<SendouButton
									size="small"
									variant="minimal-destructive"
									shape="circle"
									icon={<X />}
									aria-label="Remove from montage"
									isDisabled={rendering}
									onClick={() => unpickCandidate(candidate.key)}
								/>
							</span>
						</li>
					))}
				</ol>
			)}
		</section>
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
	const candidates = availableCandidates(montage);
	const groups = candidatesByBaseWeapon(candidates);
	const [collapsed, setCollapsed] = useState(loadCollapsedGroups);
	const allCollapsed =
		groups.length > 0 &&
		groups.every((group) => collapsed.has(String(group.baseWeaponId)));

	const toggleGroups = (groupKeys: string[], expand: boolean) => {
		const next = new Set(collapsed);
		for (const groupKey of groupKeys) {
			if (expand) next.delete(groupKey);
			else next.add(groupKey);
		}
		setCollapsed(next);
		saveCollapsedGroups(next);
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
						: "Every team with a clip is in the montage."}
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
	isDisabled,
}: {
	candidate: MontageCandidate;
	isDisabled: boolean;
}) {
	const thumbnail = useThumbnail(candidate);
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
				<SendouButton
					size="small"
					variant="outlined"
					icon={<Plus />}
					isDisabled={isDisabled}
					onClick={() => pickCandidate(candidate)}
				>
					Add
				</SendouButton>
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

/** Base weapon ids (as strings, "null" for unknown) of the collapsed clip groups. */
function loadCollapsedGroups(): Set<string> {
	try {
		const stored = JSON.parse(
			localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY) ?? "[]",
		);
		return new Set(Array.isArray(stored) ? stored.map(String) : []);
	} catch {
		return new Set();
	}
}

function saveCollapsedGroups(collapsed: Set<string>): void {
	try {
		localStorage.setItem(
			COLLAPSED_GROUPS_STORAGE_KEY,
			JSON.stringify([...collapsed]),
		);
	} catch {
		// private mode or a full quota: the groups stay collapsed for this visit
	}
}

/** The candidate's thumbnail once decoded (they queue up, one VoD open at a time). */
function useThumbnail(candidate: MontageCandidate): string | null {
	const [thumbnail, setThumbnail] = useState<string | null>(null);

	// decoding a frame is async work outside React
	useEffect(() => {
		let stale = false;
		void candidateThumbnail(candidate).then((next) => {
			if (!stale) setThumbnail(next);
		});
		return () => {
			stale = true;
		};
	}, [candidate]);

	return thumbnail;
}

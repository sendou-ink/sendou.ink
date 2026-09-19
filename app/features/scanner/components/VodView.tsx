/**
 * A scanned file: deliberately the live screen with a different header —
 * a progress bar where the LIVE pill is, a frame preview where the capture
 * preview is, and the same cards filling in underneath as games are found.
 * Leaving the scanner page cancels a running scan; nothing of it is saved. A finished scan (this visit's, from
 * vod-scan.ts, or a saved one from the store) shows its numbers, Add to VoDs
 * and Delete.
 */
import { Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LogInPopover } from "~/components/LogInPopover";
import { useUser } from "~/features/auth/core/user";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import type { ScanTelemetry } from "../core/detectors/telemetry";
import { formatPosition, formatTime } from "../core/format";
import { scannerSearchParams } from "../scanner-search-params";
import { deleteVodClips } from "../store/clips";
import {
	deleteVod,
	loadVod,
	loadVodEventFrame,
	loadVodEvents,
	type VodSummary,
} from "../store/vods";
import { refreshClips, useClips } from "./clips-feed";
import { ExportMenu } from "./ExportMenu";
import { NotFound } from "./NotFound";
import { SessionHeader, StatusPill } from "./SessionHeader";
import { type SessionInfo, SessionView } from "./SessionView";
import { matchContaining } from "./sendou-ingest";
import { sendouUpload } from "./sendou-upload";
import type { ScanEvent } from "./session-data";
import { useScannerSettings } from "./settings";
import { sendVod } from "./upload";
import { useDebug } from "./use-debug";
import styles from "./VodView.module.css";
import {
	setVodPreviewCanvas,
	startVodScan,
	uploadVodScan,
	useVodScan,
	vodScanFrame,
} from "./vod-scan";
import { refreshVods } from "./vods-feed";

export function VodView() {
	const [name] = useSearchParam(scannerSearchParams, "name");
	const scan = useVodScan();
	if (name === null) return <NotFound>No file was picked.</NotFound>;
	if (scan.name === name) return <ScanVodView name={name} />;
	return <StoredVodView name={name} />;
}

/** The scan running (or finished) this visit. */
function ScanVodView({ name }: { name: string }) {
	const scan = useVodScan();
	const settings = useScannerSettings();
	const user = useUser();
	const [telemetryOn] = useSearchParam(scannerSearchParams, "telemetry");
	const debug = useDebug();
	const scanning = scan.status === "scanning";

	return (
		<VodSessionView
			name={name}
			events={scan.events}
			running={scanning}
			getFrame={vodScanFrame}
			onUpload={(built) => {
				const id = built.sources[0]?.id;
				if (id !== undefined) void uploadVodScan(matchContaining(id));
			}}
			status={
				scan.status === "error" ? (
					<div className={styles.errorBox}>
						<p className={styles.error}>{scan.error}</p>
						<label className={styles.fileButton}>
							Try another file
							<input
								type="file"
								accept="video/*"
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = "";
									if (file) {
										void startVodScan(file, {
											saveClips: scan.saveClips,
											telemetry: telemetryOn,
										});
									}
								}}
							/>
						</label>
					</div>
				) : scanning ? (
					<div className={styles.scanning}>
						<div className={styles.progressRow}>
							<StatusPill>Scanning</StatusPill>
							<progress
								className={styles.progress}
								value={scan.progress?.t ?? 0}
								max={scan.progress?.duration ?? 1}
							/>
							<span className={styles.progressText}>
								{scan.progress
									? `${Math.round((scan.progress.t / Math.max(1, scan.progress.duration)) * 100)}% · ${formatPosition(scan.progress.t)} / ${formatPosition(scan.progress.duration)}${scan.progress.rate > 0 ? ` · ${scan.progress.rate.toFixed(1)}× realtime` : ""}`
									: "opening the file…"}
							</span>
						</div>
						<div className={styles.previewRow}>
							<canvas ref={setVodPreviewCanvas} className={styles.preview} />
							<div className={styles.previewNotes}>
								<div>
									Save clips {scan.saveClips ? "on" : "off"} · Upload{" "}
									{user && settings.upload ? "on" : "off"}
								</div>
								{scan.error ? (
									<div className={styles.error}>{scan.error}</div>
								) : null}
							</div>
						</div>
					</div>
				) : (
					<div className={styles.afterScan}>
						{scan.clipsWork?.state === "cutting"
							? `Saving clip ${Math.min(scan.clipsWork.done + 1, scan.clipsWork.total)}/${scan.clipsWork.total}…`
							: scan.clipsWork?.state === "done" && scan.clipsWork.error
								? `Clips: ${scan.clipsWork.error}`
								: null}
						{scan.uploading ? "Uploading…" : null}
						{scan.error ? (
							<span className={styles.error}>{scan.error}</span>
						) : null}
					</div>
				)
			}
			telemetry={debug && telemetryOn ? scan.telemetry : null}
		/>
	);
}

/** A saved scan reopened from the landing. */
function StoredVodView({ name }: { name: string }) {
	const stored = useStoredVod(name);
	if (stored.state === "loading") return null;
	if (stored.state === "missing") {
		return <NotFound>This VoD is no longer saved.</NotFound>;
	}
	const { events, reload } = stored;
	return (
		<VodSessionView
			name={name}
			events={events}
			running={false}
			getFrame={(event) =>
				event.hasFrame && event.id !== undefined
					? () => loadVodEventFrame(event.id!)
					: undefined
			}
			onUpload={(built) => {
				const id = built.sources[0]?.id;
				if (id !== undefined) void sendVod(name, matchContaining(id), reload);
			}}
			status={null}
			telemetry={null}
		/>
	);
}

type StoredVod =
	| { state: "loading" }
	| { state: "missing" }
	| {
			state: "ready";
			summary: VodSummary;
			events: ScanEvent[];
			reload: () => void;
	  };

/** Loads a saved VoD's summary and events; `reload` re-reads them after a send. */
function useStoredVod(name: string): StoredVod {
	const [loaded, setLoaded] = useState<{
		name: string;
		summary: VodSummary | undefined;
		events: ScanEvent[];
	} | null>(null);
	const [version, setVersion] = useState(0);

	// the store is outside React: read it when the name (or version) changes
	useEffect(() => {
		let stale = false;
		void Promise.all([loadVod(name), loadVodEvents(name)]).then(
			([summary, events]) => {
				if (!stale) setLoaded({ name, summary, events });
			},
		);
		return () => {
			stale = true;
		};
	}, [name, version]);

	if (!loaded || loaded.name !== name) return { state: "loading" };
	if (!loaded.summary) return { state: "missing" };
	return {
		state: "ready",
		summary: loaded.summary,
		events: loaded.events,
		reload: () => setVersion((v) => v + 1),
	};
}

function VodSessionView({
	name,
	events,
	running,
	getFrame,
	onUpload,
	status,
	telemetry,
}: {
	name: string;
	events: ScanEvent[];
	running: boolean;
	getFrame: (event: ScanEvent) => (() => Promise<Blob | undefined>) | undefined;
	onUpload: (built: SessionInfo["built"][number]) => void;
	status: React.ReactNode;
	telemetry: ScanTelemetry | null;
}) {
	const [, setParams] = useSearchParamsTyped(scannerSearchParams);
	const clips = useClips();
	const user = useUser();
	const vodClips = clips.filter(
		(clip) => clip.source.kind === "vod" && clip.source.name === name,
	);
	const upload = running ? null : sendouUpload(events);

	const remove = async () => {
		await deleteVod(name);
		await deleteVodClips(name);
		await Promise.all([refreshVods(), refreshClips()]);
		setParams({ view: "home" });
	};

	return (
		<SessionView
			kind="vod"
			events={events}
			originT={0}
			clips={vodClips}
			clipsTitle="Clips"
			running={running}
			canUpload={Boolean(user)}
			onUpload={onUpload}
			getFrame={getFrame}
			emptyText={
				running
					? "Games appear here as their results screens are found."
					: "No games were found in this file."
			}
			header={(info) => (
				<SessionHeader
					actions={
						<>
							<ExportMenu
								built={info.built}
								events={events}
								source={{ label: name, originT: 0 }}
								clipCounts={info.clipCounts}
								fileBase={name.replace(/\.[^.]+$/, "")}
							/>
							{upload?.url ? (
								user ? (
									<LinkButton
										to={upload.url}
										size="small"
										variant="outlined"
										icon={<Video />}
									>
										Add to VoDs
									</LinkButton>
								) : (
									<LogInPopover>
										<SendouButton
											size="small"
											variant="outlined"
											icon={<Video />}
										>
											Add to VoDs
										</SendouButton>
									</LogInPopover>
								)
							) : null}
							{!running ? (
								<FormWithConfirm
									dialogHeading={`Delete the scan of "${name}"?`}
									description="Its games, frames and clips are removed from this browser. The file itself is untouched."
									onConfirm={() => void remove()}
								>
									<SendouButton
										size="small"
										variant="destructive"
										icon={<Trash2 />}
									>
										Delete
									</SendouButton>
								</FormWithConfirm>
							) : null}
						</>
					}
				>
					<div className={styles.title}>{name}</div>
					{upload?.problem ? (
						<div className={styles.partial}>
							Add to VoDs unavailable: {upload.problem}
						</div>
					) : null}
				</SessionHeader>
			)}
		>
			{status}
			{telemetry ? <TelemetryPanel telemetry={telemetry} /> : null}
		</SessionView>
	);
}

function TelemetryPanel({ telemetry }: { telemetry: ScanTelemetry }) {
	const detectors = Object.entries(telemetry.detectors).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const coveredS = telemetry.activeVideoS + telemetry.skimVideoS;
	return (
		<details className={styles.telemetry}>
			<summary>
				telemetry · analyzed {telemetry.analyzedFrames}/
				{telemetry.decodedFrames} decoded frames
				{coveredS > 0
					? ` · skimmed ${formatTime(telemetry.skimVideoS)} of ${formatTime(coveredS)}`
					: null}
				{telemetry.wallMs > 0
					? ` · ${formatTime(telemetry.wallMs / 1000)} cpu`
					: null}
			</summary>
			<table>
				<thead>
					<tr>
						<th>detector</th>
						<th>checks</th>
						<th>gate pass</th>
						<th>gate ms</th>
						<th>parses</th>
						<th>parse ms</th>
						<th>suppressed</th>
					</tr>
				</thead>
				<tbody>
					{detectors.map(([id, d]) => (
						<tr key={id}>
							<td>{id}</td>
							<td>{d.checks}</td>
							<td>{d.gatePasses}</td>
							<td>{Math.round(d.gateMs)}</td>
							<td>{d.parses}</td>
							<td>{Math.round(d.parseMs)}</td>
							<td>{d.suppressedParses}</td>
						</tr>
					))}
				</tbody>
			</table>
		</details>
	);
}

/**
 * A scanned file: deliberately the live screen with a different header —
 * a progress bar where the LIVE pill is, a frame preview where the capture
 * preview is, and the same cards filling in underneath as games are found.
 * Leaving the scanner page cancels a running scan; nothing of it is saved. A finished scan (this visit's, from
 * vod-scan.ts, or a saved one from the store) shows its numbers, Add to VoDs
 * and Delete.
 */
import { GraduationCap, Trash2, Video } from "lucide-react";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LogInPopover } from "~/components/LogInPopover";
import { useUser } from "~/features/auth/core/user";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import type { ScanTelemetry } from "../core/detectors/telemetry";
import { formatTime } from "../core/format";
import { isHistoryOnly } from "../core/match-builder";
import { scannerSearchParams } from "../scanner-search-params";
import { deleteVodClips } from "../store/clips";
import { deleteVod, loadVodEventFrame } from "../store/vods";
import { refreshClips, useClips } from "./clips-feed";
import { ExportMenu } from "./ExportMenu";
import { NotFound } from "./NotFound";
import { ScanWorkers } from "./ScanWorkers";
import { SessionHeader, StatusPill } from "./SessionHeader";
import { SessionView } from "./SessionView";
import { sendouUpload } from "./sendou-upload";
import type { ScanEvent } from "./session-data";
import { useDebug } from "./use-debug";
import styles from "./VodView.module.css";
import { isThisVisitsVodClip } from "./visit";
import { cachedBuild, useStoredVod } from "./vod-data";
import {
	startVodScan,
	useVodScan,
	useVodScanProgress,
	VOD_FILE_ACCEPT,
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
	const [telemetryOn] = useSearchParam(scannerSearchParams, "telemetry");
	const debug = useDebug();
	const scanning = scan.status === "scanning";

	return (
		<VodSessionView
			name={name}
			events={scan.events}
			running={scanning}
			getFrame={vodScanFrame}
			status={
				scan.status === "error" ? (
					<div className={styles.errorBox}>
						<p className={styles.error}>{scan.error}</p>
						<label className={styles.fileButton}>
							Try another file
							<input
								type="file"
								accept={VOD_FILE_ACCEPT}
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = "";
									if (file) {
										void startVodScan(file, { telemetry: telemetryOn });
									}
								}}
							/>
						</label>
					</div>
				) : scanning ? (
					<ScanWorkers events={scan.events}>
						{scan.error ? (
							<div className={styles.error}>{scan.error}</div>
						) : null}
					</ScanWorkers>
				) : (
					<div className={styles.afterScan}>
						{scan.tookSeconds !== null ? (
							<>
								<StatusPill tone="success">Done</StatusPill>
								<span>Scanned in {Math.round(scan.tookSeconds)}s</span>
							</>
						) : null}
						{scan.clipsWork?.state === "cutting"
							? `Saving clip ${Math.min(scan.clipsWork.done + 1, scan.clipsWork.total)}/${scan.clipsWork.total}…`
							: scan.clipsWork?.state === "done" && scan.clipsWork.error
								? `Clips: ${scan.clipsWork.error}`
								: null}
						{scan.error ? (
							<span className={styles.error}>{scan.error}</span>
						) : null}
					</div>
				)
			}
			telemetry={debug && telemetryOn ? <ScanTelemetryPanel /> : null}
		/>
	);
}

function ScanTelemetryPanel() {
	const { telemetry } = useVodScanProgress();
	return telemetry ? <TelemetryPanel telemetry={telemetry} /> : null;
}

/** A saved scan reopened from the landing. */
function StoredVodView({ name }: { name: string }) {
	const stored = useStoredVod(name);
	if (stored.state === "loading") return null;
	if (stored.state === "missing") {
		return <NotFound>This VoD is no longer saved.</NotFound>;
	}
	return (
		<VodSessionView
			name={name}
			events={stored.events}
			running={false}
			getFrame={(event) =>
				event.hasFrame && event.id !== undefined
					? () => loadVodEventFrame(event.id!)
					: undefined
			}
			status={null}
			telemetry={null}
		/>
	);
}

function VodSessionView({
	name,
	events,
	running,
	getFrame,
	status,
	telemetry,
}: {
	name: string;
	events: ScanEvent[];
	running: boolean;
	getFrame: (event: ScanEvent) => (() => Promise<Blob | undefined>) | undefined;
	status: React.ReactNode;
	telemetry: React.ReactNode;
}) {
	const [, setParams] = useSearchParamsTyped(scannerSearchParams);
	const clips = useClips();
	const user = useUser();
	const vodClips = clips.filter((clip) => isThisVisitsVodClip(clip, name));
	const upload = running ? null : sendouUpload(events);
	const built = cachedBuild(events);

	const remove = async () => {
		await deleteVod(name);
		await deleteVodClips((clip) => isThisVisitsVodClip(clip, name));
		await Promise.all([refreshVods(), refreshClips()]);
		setParams({ view: "home" });
	};

	return (
		<SessionView
			kind="vod"
			built={built}
			events={events}
			originT={0}
			clips={vodClips}
			clipsTitle="Clips"
			running={running}
			getFrame={getFrame}
			emptyText={
				running
					? "Games appear here as their results screens are found."
					: "No games were found in this file."
			}
			coachHref={(b) =>
				running || isHistoryOnly(b) || b.match.startsAt === null
					? null
					: scannerSearchParams.href(SCANNER_PAGE, {
							view: "coach",
							name,
							t: Math.floor(b.match.startsAt),
						})
			}
			header={(info) => (
				<SessionHeader
					actions={
						<>
							{!running && built.length > 0 ? (
								<LinkButton
									to={scannerSearchParams.href(SCANNER_PAGE, {
										view: "coach",
										name,
									})}
									size="small"
									icon={<GraduationCap />}
								>
									Coach mode
								</LinkButton>
							) : null}
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
							<ExportMenu
								built={info.built}
								events={events}
								source={{ label: name, originT: 0 }}
								clipsByMatch={info.clipsByMatch}
								fileBase={name.replace(/\.[^.]+$/, "")}
							/>
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
			{telemetry}
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
				{telemetry.gpuScans > 0
					? ` · WebGPU in ${telemetry.gpuScans} workers, ${formatTime(telemetry.gpuWaitMs / 1000)} waited`
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

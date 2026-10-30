/**
 * The header's scanner panel, drawn from a `ScannerActivityState`. Mounted
 * only while the popover is open, so the preview video and the elapsed-time
 * tick cost nothing the rest of the time.
 */
import clsx from "clsx";
import { Play, RotateCcw, Square } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { Spinner } from "~/components/elements/Spinner";
import { Image, ModeImage, StageImage } from "~/components/Image";
import { ActivityBadge, RecDot } from "~/components/layout/ActivityButton";
import {
	ActivityPanel,
	ActivityPanelControls,
	ActivityPanelHeader,
} from "~/components/layout/ActivityPanel";
import { navIconUrl, SCANNER_PAGE } from "~/utils/urls";
import type {
	ScannerActivityActions,
	ScannerActivityState,
} from "../scanner-activity";
import { scannerSearchParams } from "../scanner-search-params";
import styles from "./ScannerActivityPanel.module.css";

export function ScannerActivityPanel({
	activity,
	actions,
}: {
	activity: ScannerActivityState;
	actions: ScannerActivityActions;
}) {
	const isCapturing =
		activity.status === "running" || activity.status === "starting";

	return (
		<ActivityPanel>
			<ActivityPanelHeader
				icon={
					activity.status === "error" ? undefined : (
						<RecDot stopped={!isCapturing} />
					)
				}
				title={
					activity.status === "running"
						? "Capturing"
						: activity.status === "starting"
							? "Starting capture…"
							: activity.status === "error"
								? "Capture stopped"
								: "Not capturing"
				}
				titleClassName={clsx(activity.status === "error" && "text-error")}
				subtitle={activity.sourceName}
				end={
					activity.status === "running" && activity.since !== null ? (
						<Elapsed since={activity.since} />
					) : activity.status === "starting" ? (
						<Spinner className={styles.spinner} />
					) : activity.status === "error" ? (
						<span className={styles.errorBadge}>
							<ActivityBadge kind="error" />
						</span>
					) : null
				}
			/>
			{activity.status === "running" && activity.stream ? (
				<Preview stream={activity.stream} />
			) : null}
			<StatusBlock activity={activity} />
			{activity.stats ? (
				<dl className={styles.stats}>
					<div>
						<dt>Games</dt>
						<dd>{activity.stats.games}</dd>
					</div>
					<div>
						<dt>Uploaded</dt>
						<dd>
							{activity.stats.uploaded}/{activity.stats.games}
						</dd>
					</div>
					<div>
						<dt>Clips</dt>
						<dd>{activity.stats.clips}</dd>
					</div>
				</dl>
			) : null}
			<ActivityPanelControls className={styles.controls}>
				<LinkButton
					to={scannerSearchParams.href(SCANNER_PAGE, {
						view: isCapturing ? "live" : "home",
					})}
					size="small"
					variant="outlined"
					icon={<Image path={navIconUrl("scanner")} size={16} alt="" />}
				>
					Open scanner
				</LinkButton>
				{activity.status === "error" ? (
					<SendouButton
						size="small"
						icon={<RotateCcw />}
						onClick={actions.start}
					>
						Restart
					</SendouButton>
				) : isCapturing ? (
					<SendouButton
						size="small"
						variant="outlined-destructive"
						icon={<Square />}
						onClick={actions.stop}
					>
						Stop
					</SendouButton>
				) : (
					<SendouButton size="small" icon={<Play />} onClick={actions.start}>
						Start
					</SendouButton>
				)}
			</ActivityPanelControls>
		</ActivityPanel>
	);
}

function StatusBlock({ activity }: { activity: ScannerActivityState }) {
	const { t } = useTranslation(["game-misc"]);

	if (activity.status === "error") {
		return <span className="text-xs text-error">{activity.error}</span>;
	}

	if (activity.status === "idle") {
		return (
			<span className="text-xs text-lighter">
				Reads your games off the capture source picked on the scanner page
			</span>
		);
	}

	if (activity.status === "starting") return null;

	if (activity.game) {
		const { mode, stageId, score } = activity.game;

		return (
			<div className={styles.block}>
				{stageId !== null ? (
					<StageImage stageId={stageId} width={64} className="rounded-sm" />
				) : null}
				<div className={styles.gameText}>
					<span className="text-xs font-semi-bold stack horizontal xs items-center">
						{mode ? <ModeImage mode={mode} size={16} /> : null}
						{stageId !== null ? t(`game-misc:STAGE_${stageId}`) : "In game"}
					</span>
					<span className="text-xxs text-lighter">
						{score ? `In game · ${score[0]} – ${score[1]}` : "In game"}
					</span>
				</div>
			</div>
		);
	}

	if (activity.uploadingCount > 0) {
		return (
			<div className={styles.block}>
				<Spinner className={styles.spinner} />
				Uploading {activity.uploadingCount}{" "}
				{activity.uploadingCount === 1 ? "game" : "games"}…
			</div>
		);
	}

	return (
		<div className={clsx(styles.block, "text-lighter")}>
			Waiting for a game to start…
		</div>
	);
}

function Preview({ stream }: { stream: MediaStream }) {
	return (
		<video
			ref={(video) => {
				if (video && video.srcObject !== stream) video.srcObject = stream;
			}}
			className={styles.preview}
			muted
			playsInline
			autoPlay
		/>
	);
}

function Elapsed({ since }: { since: number }) {
	const [now, setNow] = React.useState(() => Date.now());

	React.useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const seconds = Math.max(0, Math.floor((now - since) / 1000));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const pad = (value: number) => String(value).padStart(2, "0");

	return (
		<span className={styles.elapsed}>
			{hours}:{pad(minutes)}:{pad(seconds % 60)}
		</span>
	);
}

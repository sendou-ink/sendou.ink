/**
 * The settings popover, opened from ⚙ on the landing and the live header:
 * the upload, clip and GPU toggles, the retention notes, and the debug tools
 * (enabling debug mode, saving the live frame, the fixtures link in development). The source lives on the landing's Live card, the one place
 * it must be right.
 */
import { Bug, Camera, Settings } from "lucide-react";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { useSearchParam } from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import { MAX_SESSIONS } from "../core/sessions";
import { scannerSearchParams } from "../scanner-search-params";
import { MAX_HISTORY_CLIPS } from "../store/clips";
import styles from "./SettingsPopover.module.css";
import {
	AUDIO_OFFSET_LIMIT_MS,
	CLIP_MIN_KILLS_OPTIONS,
	updateSettings,
	useScannerSettings,
} from "./settings";
import { isLoggedIn } from "./upload";
import { useDebug } from "./use-debug";

/** a step of one frame-ish: fine enough to tune by ear, coarse enough to reach a second in a few clicks */
const AUDIO_OFFSET_STEP_MS = 25;

export function SettingsPopover({
	onSaveFrame,
}: {
	/** set while capturing: downloads the current live frame */
	onSaveFrame?: () => void;
}) {
	const settings = useScannerSettings();
	const loggedIn = isLoggedIn();
	const debug = useDebug();
	const [, setDebugParam] = useSearchParam(scannerSearchParams, "debug");
	const showFixturesLink = process.env.NODE_ENV === "development";
	const showSaveFrame = debug && onSaveFrame !== undefined;
	const gpuSupported = "gpu" in navigator;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					size="small"
					icon={<Settings />}
					aria-label="Settings"
				>
					Settings
				</SendouButton>
			}
			popoverClassName={styles.popover}
			placement="bottom end"
		>
			<div className={styles.settings}>
				<section className={styles.section}>
					<SendouSwitch
						size="small"
						isSelected={settings.upload}
						isDisabled={!loggedIn}
						onChange={(upload) => updateSettings({ upload })}
					>
						{loggedIn
							? "Upload results to sendou.ink"
							: "Upload results to sendou.ink (log in first)"}
					</SendouSwitch>
					<SendouSwitch
						size="small"
						isSelected={settings.saveClips}
						onChange={(saveClips) => updateSettings({ saveClips })}
					>
						Save clips
					</SendouSwitch>
					<SendouSwitch
						size="small"
						isSelected={gpuSupported && settings.webgpu}
						isDisabled={!gpuSupported}
						onChange={(webgpu) => updateSettings({ webgpu })}
					>
						{gpuSupported
							? "Use the graphics card (faster scans)"
							: "Use the graphics card (not supported by this browser)"}
					</SendouSwitch>
					<div className={styles.row}>
						<span className={styles.rowLabel}>Clip on splats in a row</span>
						<SendouChipRadioGroup>
							{CLIP_MIN_KILLS_OPTIONS.map((n) => (
								<SendouChipRadio
									key={n}
									name="clip-min-kills"
									value={String(n)}
									checked={settings.clipMinKills === n}
									onChange={() => updateSettings({ clipMinKills: n })}
								>
									{n}
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					</div>
					<div className={styles.row}>
						<label className={styles.rowLabel} htmlFor="scanner-audio-offset">
							Clip audio offset (ms)
						</label>
						<input
							id="scanner-audio-offset"
							type="number"
							className={styles.number}
							value={settings.audioOffsetMs}
							min={-AUDIO_OFFSET_LIMIT_MS}
							max={AUDIO_OFFSET_LIMIT_MS}
							step={AUDIO_OFFSET_STEP_MS}
							onChange={(e) => {
								const value = e.target.valueAsNumber;
								if (Number.isFinite(value)) {
									updateSettings({
										audioOffsetMs: Math.max(
											-AUDIO_OFFSET_LIMIT_MS,
											Math.min(AUDIO_OFFSET_LIMIT_MS, value),
										),
									});
								}
							}}
						/>
						<span className={styles.hint}>
							Sound ahead of the picture? Raise it. Behind? Lower it. Desktop
							audio and a capture card usually need a few hundred ms.
						</span>
					</div>
				</section>
				<p className={styles.note}>
					Clip history keeps the {MAX_HISTORY_CLIPS} best; the lowest is
					replaced when full. Download what you want to keep. This session's
					clips are safe until you stop.
					<br />
					Sessions: last 30 days or {MAX_SESSIONS} sessions.
				</p>
				{!debug || showSaveFrame || showFixturesLink ? (
					<section className={styles.section}>
						<span className={styles.label}>Debug</span>
						<div className={styles.row}>
							{!debug ? (
								<SendouButton
									size="small"
									variant="minimal"
									icon={<Bug />}
									onClick={() => setDebugParam(true)}
								>
									Enable debug
								</SendouButton>
							) : null}
							{showSaveFrame ? (
								<SendouButton
									size="small"
									variant="minimal"
									icon={<Camera />}
									onClick={onSaveFrame}
								>
									Save frame as fixture
								</SendouButton>
							) : null}
							{showFixturesLink ? (
								<Link
									to={scannerSearchParams.href(SCANNER_PAGE, {
										view: "fixtures",
									})}
									defaultShouldRevalidate={false}
								>
									Fixtures
								</Link>
							) : null}
						</div>
					</section>
				) : null}
			</div>
		</SendouPopover>
	);
}

/** `2026-09-16 19:02` — the session's start as the matches CSV's source */
export function sessionLabel(startedAt: number): string {
	const d = new Date(startedAt);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The settings popover, opened from ⚙ on the landing and the live header:
 * the upload and clip toggles, the retention notes, and the debug links for
 * those who see them. The
 * source lives on the landing's Live card, the one place it must be right.
 */
import { Settings } from "lucide-react";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { SCANNER_PAGE } from "~/utils/urls";
import { MAX_SESSIONS } from "../core/sessions";
import { scannerSearchParams } from "../scanner-search-params";
import { MAX_HISTORY_CLIPS } from "../store/clips";
import styles from "./SettingsPopover.module.css";
import {
	CLIP_MIN_KILLS_OPTIONS,
	updateSettings,
	useScannerSettings,
} from "./settings";
import { isLoggedIn } from "./upload";
import { useDebug } from "./use-debug";

export function SettingsPopover() {
	const settings = useScannerSettings();
	const debug = useDebug();
	const loggedIn = isLoggedIn();

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
				</section>
				<p className={styles.note}>
					Clip history keeps the {MAX_HISTORY_CLIPS} best; the lowest is
					replaced when full. Download what you want to keep. This session's
					clips are safe until you stop.
					<br />
					Sessions: last 30 days or {MAX_SESSIONS} sessions.
				</p>
				{debug ? (
					<section className={styles.section}>
						<span className={styles.label}>Debug</span>
						<div className={styles.row}>
							<Link
								to={scannerSearchParams.href(SCANNER_PAGE, { view: "debug" })}
								defaultShouldRevalidate={false}
							>
								Image / screenshot view
							</Link>
							{process.env.NODE_ENV === "development" ? (
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

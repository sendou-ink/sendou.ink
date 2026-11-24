import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
	OBS_TOO_OLD_ID,
	ON_AIR_GUARD_MARKER,
	onAirGuardScript,
} from "../broadcast-on-air";

// inline styles: the card shows exactly when the page's own scripts and styles can't be relied on, written for
// browsers years old
const CARD_STYLE: CSSProperties = {
	position: "fixed",
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
	zIndex: 2147483647,
	display: "grid",
	placeItems: "center",
	background: "rgba(0, 0, 0, 0.6)",
	fontFamily: "Arial, sans-serif",
};

const CARD_BODY_STYLE: CSSProperties = {
	maxWidth: "60vw",
	padding: "4vh 4vw",
	borderRadius: "1.5vh",
	borderTop: "1vh solid #ff3f8f",
	background: "#10121f",
	color: "#ffffff",
	textAlign: "center",
};

/**
 * Guards a page OBS shows, see `onAirGuardScript`: the card telling the producer to update OBS (shown by the script
 * when the browser is too old) and the script itself. Rendered before the page's content so the script runs first.
 */
export function BroadcastOnAirGuard() {
	const { t } = useTranslation(["broadcast"]);

	return (
		<>
			<div id={OBS_TOO_OLD_ID} hidden suppressHydrationWarning>
				<div style={CARD_STYLE}>
					<div style={CARD_BODY_STYLE}>
						<div style={{ fontSize: "6vh", fontWeight: 700 }}>
							{t("broadcast:overlay.obsTooOld.title")}
						</div>
						<div style={{ fontSize: "3vh", marginTop: "2vh" }}>
							{t("broadcast:overlay.obsTooOld.description")}
						</div>
					</div>
				</div>
			</div>
			<script
				{...{ [ON_AIR_GUARD_MARKER]: "" }}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: a constant of ours, inline so it runs even when the app's scripts fail to load
				dangerouslySetInnerHTML={{ __html: onAirGuardScript }}
			/>
		</>
	);
}

import type * as React from "react";
import { useTranslation } from "react-i18next";
import { BROADCAST_CANVAS } from "../broadcast-constants";
import type { BroadcastState, BroadcastView } from "../broadcast-types";
import { combineStyles, pronounsLabel, scenePart } from "../broadcast-utils";
import layout from "./CastersScene.layout.module.css";
import look from "./CastersScene.module.css";
import { Matchup } from "./Matchup";
import { SceneBackdrop } from "./SceneBackdrop";

const styles = combineStyles(look, layout);

const part = scenePart("casters");

/** Frames when no casters are named, the usual duo. */
const DEFAULT_FRAME_COUNT = 2;

/** Where the camera frames are by how many casters there are, on the 1920×1080 canvas. */
const FRAME_LAYOUTS: Record<
	number,
	Array<{ x: number; y: number; w: number }>
> = {
	1: [{ x: 400, y: 200, w: 1120 }],
	2: [
		{ x: 120, y: 220, w: 820 },
		{ x: 980, y: 220, w: 820 },
	],
	3: [
		{ x: 80, y: 260, w: 560 },
		{ x: 680, y: 260, w: 560 },
		{ x: 1280, y: 260, w: 560 },
	],
};

/**
 * Full screen with see-through 16:9 frames for the casters' cameras, their names under them. The cameras are
 * OBS sources under the overlay, lined up with the frames.
 */
export function CastersScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const casters = state.casters;
	const frames =
		FRAME_LAYOUTS[casters.length] ?? FRAME_LAYOUTS[DEFAULT_FRAME_COUNT];

	return (
		<div className={styles.casters}>
			<div className={styles.backdrop} style={cutOut(frames)}>
				<SceneBackdrop />
			</div>
			<header className={styles.header} {...part("header")}>
				<div className={styles.eyebrow} {...part("tournament-name")}>
					{state.tournament.name}
				</div>
				<h1 className={styles.title} {...part("title")}>
					{t("broadcast:overlay.title.casters")}
				</h1>
			</header>
			{frames.map((frame, i) => (
				<div
					key={i}
					className={styles.frame}
					style={
						{
							left: frame.x,
							top: frame.y,
							width: frame.w,
							height: frameHeight(frame),
							"--i": i,
						} as React.CSSProperties
					}
					{...part("camera")}
				>
					{casters[i] ? (
						<div className={styles.name} {...part("caster-name")}>
							{casters[i].name}
							{casters[i].pronouns ? (
								<span className={styles.pronouns} {...part("caster-pronouns")}>
									{pronounsLabel(casters[i].pronouns)}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			))}
			{state.match && frames.length > 1 ? (
				<div className={styles.matchup}>
					<Matchup match={state.match} view={view} producer={state[view]} />
				</div>
			) : null}
		</div>
	);
}

function frameHeight(frame: { w: number }) {
	return Math.round((frame.w * 9) / 16);
}

/** Cuts the frames out of the backdrop, so the cameras under the overlay show through them. */
function cutOut(
	frames: Array<{ x: number; y: number; w: number }>,
): React.CSSProperties {
	const holes = frames
		.map(
			(frame) =>
				`M${frame.x} ${frame.y}h${frame.w}v${frameHeight(frame)}h${-frame.w}Z`,
		)
		.join("");

	return {
		clipPath: `path(evenodd, "M0 0H${BROADCAST_CANVAS.width}V${BROADCAST_CANVAS.height}H0Z${holes}")`,
	};
}

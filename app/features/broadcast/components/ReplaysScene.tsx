import { useTranslation } from "react-i18next";
import { ModeImage } from "~/components/Image";
import type { BroadcastState, BroadcastView } from "../broadcast-types";
import { scenePart } from "../broadcast-utils";
import styles from "./ReplaysScene.module.css";

const part = scenePart("replays");

/** Over the replay footage: a frame around the screen and a replay bug telling which game is replayed. */
export function ReplaysScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);
	const progress = state.match?.progress[view];
	const lastPlayed = progress?.games[progress.resultCount - 1];

	return (
		<div className={styles.replays}>
			{(["tl", "tr", "bl", "br"] as const).map((corner) => (
				<span
					key={corner}
					className={styles.corner}
					data-corner={corner}
					{...part("corner")}
				/>
			))}
			<div className={styles.bug} {...part("replay-bug")}>
				<span className={styles.dot} {...part("replay-dot")} />
				<span className={styles.label} {...part("replay-label")}>
					{t("broadcast:overlay.title.replays")}
				</span>
				{lastPlayed?.map ? (
					<span className={styles.game} {...part("game")}>
						<ModeImage mode={lastPlayed.map.mode} size={26} loading="eager" />
						{t("broadcast:overlay.game", { number: progress?.resultCount })} ·{" "}
						{t(`game-misc:STAGE_${lastPlayed.map.stageId}`)}
					</span>
				) : null}
			</div>
		</div>
	);
}

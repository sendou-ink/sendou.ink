import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { ModeImage, StageImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import type { loader } from "../loaders/scrims.$id.server";
import styles from "./ScrimMatchResultTab.module.css";

// xxx: why not using Timeline?

export function ScrimMatchResultTab() {
	const { t } = useTranslation(["scrims", "game-misc", "q"]);
	const data = useLoaderData<typeof loader>();
	const maps = data.mapByMap?.maps ?? [];

	if (maps.length === 0) {
		return (
			<SendouTabPanel id={TAB_KEYS.RESULT}>
				<div>{t("scrims:mapByMap.result.empty")}</div>
			</SendouTabPanel>
		);
	}

	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<div className={styles.root} data-testid="scrim-result-timeline">
				{maps.map((map) => (
					<div
						key={map.id}
						className={styles.row}
						data-testid={`result-row-${map.index}`}
					>
						<span className={styles.idx}>{map.index + 1}</span>
						<StageImage stageId={map.stageId} width={72} />
						<div className={styles.modeStage}>
							<div className={styles.modeStageHeader}>
								<ModeImage mode={map.mode} width={20} />
								<span>{t(`game-misc:STAGE_${map.stageId}` as const)}</span>
							</div>
							{map.replayOfIndex !== null ? (
								<span className={styles.replayTag}>
									{t("scrims:mapByMap.result.replayTag", {
										index: map.replayOfIndex + 1,
									})}
								</span>
							) : null}
						</div>
						{map.winnerSide ? (
							<span
								className={clsx(styles.winner, {
									[styles.winnerAlpha]: map.winnerSide === "ALPHA",
									[styles.winnerBravo]: map.winnerSide === "BRAVO",
								})}
							>
								{map.winnerSide === "ALPHA"
									? t("q:match.sides.alpha")
									: t("q:match.sides.bravo")}
							</span>
						) : null}
					</div>
				))}
			</div>
		</SendouTabPanel>
	);
}

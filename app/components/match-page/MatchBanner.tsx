import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { stageBannerImageUrl } from "~/utils/urls";
import { ModeImage } from "../Image";
import styles from "./MatchBanner.module.css";

export function MatchBanner({
	children,
	stageId,
	mode,
}: {
	children: React.ReactNode;
	stageId: StageId;
	mode: ModeShort;
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div
			className={styles.root}
			style={{
				"--stage-img": `url(${stageBannerImageUrl(stageId)})`,
			}}
		>
			<div className={clsx(styles.mode, styles.thickText)}>
				<ModeImage mode={mode} size={24} />
				{t(`game-misc:MODE_SHORT_${mode}`)} {t(`game-misc:STAGE_${stageId}`)}
			</div>
			<div className={clsx(styles.stage, styles.thickText)}>
				{t(`game-misc:STAGE_${stageId}`)}
			</div>
			{children}
		</div>
	);
}

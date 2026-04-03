import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { stageBannerImageUrl } from "~/utils/urls";
import { ModeImage } from "../Image";
import styles from "./MatchBanner.module.css";

export function MatchBannerContainer({
	children,
}: { children: React.ReactNode }) {
	return <div className={styles.root}>{children}</div>;
}

interface MatchBannerProps {
	stageId: StageId;
	mode: ModeShort;
	children: React.ReactNode;
}

export function MatchBanner({ stageId, mode, children }: MatchBannerProps) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div
			className={styles.banner}
			style={{
				"--stage-img": `url(${stageBannerImageUrl(stageId)})`,
			}}
		>
			<div className={clsx(styles.map, styles.thickText)}>
				<ModeImage mode={mode} size={24} />
				{t(`game-misc:MODE_SHORT_${mode}`)} {t(`game-misc:STAGE_${stageId}`)}
			</div>
			<div className={clsx(styles.info, styles.thickText)}>{children}</div>
		</div>
	);
}

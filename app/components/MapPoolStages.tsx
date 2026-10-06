import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { modeImageUrl, stageImageUrl } from "~/utils/urls";

import styles from "./MapPoolStages.module.css";

/** Read-only view of a map pool: a row per stage in it with the modes it is played in. */
export function MapPoolStages({ mapPool }: { mapPool: MapPool }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className="stack md">
			{stageIds
				.filter((stageId) => mapPool.hasStage(stageId))
				.map((stageId) => (
					<div key={stageId} className={styles.stageRow}>
						<Image
							className={styles.stageImage}
							alt=""
							path={stageImageUrl(stageId)}
							width={80}
							height={45}
						/>
						<div className={styles.stageNameRow}>
							<div>{t(`game-misc:STAGE_${stageId}`)}</div>
							<div className={styles.modes}>
								{modesShort
									.filter((mode) => mapPool.has({ stageId, mode }))
									.map((mode) => (
										<Image
											key={mode}
											title={t(`game-misc:MODE_LONG_${mode}`)}
											alt={t(`game-misc:MODE_LONG_${mode}`)}
											path={modeImageUrl(mode)}
											width={33}
											height={33}
										/>
									))}
							</div>
						</div>
					</div>
				))}
		</div>
	);
}

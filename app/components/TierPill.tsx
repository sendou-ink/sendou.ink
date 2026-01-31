import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { tierNumberToName } from "~/features/tournament/core/tiering";
import styles from "./TierPill.module.css";

const TIER_STYLE_CLASS: Record<number, string> = {
	1: styles.tierX,
	2: styles.tierSPlus,
	3: styles.tierS,
	4: styles.tierAPlus,
	5: styles.tierA,
	6: styles.tierBPlus,
	7: styles.tierB,
	8: styles.tierCPlus,
	9: styles.tierC,
};

export function TierPill({
	tier,
	isTentative = false,
}: {
	tier: number;
	isTentative?: boolean;
}) {
	const { t } = useTranslation();
	const tierName = tierNumberToName(tier);
	const tierClass = TIER_STYLE_CLASS[tier] ?? "";
	const displayName = isTentative ? `~${tierName}` : tierName;

	return (
		<div
			className={clsx(styles.pill, tierClass)}
			data-testid={isTentative ? "tentative-tier" : "confirmed-tier"}
			title={
				isTentative
					? t("tier.tentative", { tierName })
					: t("tier.confirmed", { tierName })
			}
		>
			{displayName}
		</div>
	);
}

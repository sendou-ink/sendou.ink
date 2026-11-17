import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./MatchBannerArrows.module.css";

/** Arrows on the sides of a match banner for stepping through the match's maps; one without a handler is left out. */
export function MatchBannerArrows({
	onPrevious,
	onNext,
	children,
}: {
	onPrevious?: () => void;
	onNext?: () => void;
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.root}>
			{children}
			{onPrevious ? (
				<button
					type="button"
					className={styles.arrow}
					data-side="previous"
					onClick={onPrevious}
					aria-label={t("common:actions.previous")}
					data-testid="banner-previous-map"
				>
					<ChevronLeft />
				</button>
			) : null}
			{onNext ? (
				<button
					type="button"
					className={styles.arrow}
					data-side="next"
					onClick={onNext}
					aria-label={t("common:actions.next")}
					data-testid="banner-next-map"
				>
					<ChevronRight />
				</button>
			) : null}
		</div>
	);
}

import { useTranslation } from "react-i18next";
import styles from "./MatchBannerTopRow.module.css";

interface MatchBannerTopRowProps {
	score?: {
		alpha: number;
		bravo: number;
		isFinal: boolean;
		count?: number;
		bestOf?: boolean;
	};
	children?: React.ReactNode;
}

export function MatchBannerTopRow({ score, children }: MatchBannerTopRowProps) {
	return (
		<div className={styles.root}>
			{score ? <Score score={score} /> : <div />}
			{children}
		</div>
	);
}

function Score({
	score,
}: {
	score: NonNullable<MatchBannerTopRowProps["score"]>;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={styles.values}>
			<div>
				{score.alpha}-{score.bravo}
			</div>
			<div
				className={styles.sub}
				data-testid={score.isFinal ? "match-final" : undefined}
			>
				{score.isFinal
					? t("q:match.banner.final")
					: score.count !== undefined
						? score.bestOf
							? t("q:match.banner.bestOf", { count: score.count })
							: t("q:match.banner.playAll", { count: score.count })
						: null}
			</div>
		</div>
	);
}

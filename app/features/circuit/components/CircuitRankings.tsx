import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { WeaponImage } from "~/components/Image";
import {
	RankTable,
	RankTableInnerRow,
	RankTableRank,
	RankTableRow,
} from "~/components/RankTable";
import type {
	CircuitLeaderboard,
	CircuitStandingsEntry,
} from "../circuit-types";
import styles from "./CircuitRankings.module.css";

export function CircuitStandings({
	entries,
}: {
	entries: CircuitStandingsEntry[];
}) {
	const { t } = useTranslation(["circuit"]);

	return (
		<RankTable>
			{entries.map((entry, i) => (
				<RankTableRow key={entry.teamName}>
					<RankTableInnerRow>
						<RankTableRank>{i + 1}</RankTableRank>
						<Avatar
							url={entry.logoUrl}
							identiconInput={entry.teamName}
							size="xxs"
						/>
						<span className="truncate">{entry.teamName}</span>
						<span className={styles.value}>
							{t("circuit:points", { points: entry.points })}
						</span>
					</RankTableInnerRow>
				</RankTableRow>
			))}
		</RankTable>
	);
}

export function CircuitFeaturedLeaderboard({
	leaderboard,
}: {
	leaderboard: CircuitLeaderboard;
}) {
	const { i18n } = useTranslation();
	const percentFormatter = new Intl.NumberFormat(i18n.language, {
		style: "percent",
	});

	return (
		<RankTable>
			{leaderboard.entries.map((entry, i) => (
				<RankTableRow key={entry.id}>
					<RankTableInnerRow>
						<RankTableRank>{i + 1}</RankTableRank>
						<Avatar user={entry} size="xxs" />
						<WeaponImage
							weaponSplId={entry.weaponSplId}
							variant="build"
							size={24}
						/>
						<span className="truncate">{entry.username}</span>
						<span className={styles.value}>
							{leaderboard.type === "KD"
								? entry.value.toFixed(2)
								: percentFormatter.format(entry.value)}
						</span>
					</RankTableInnerRow>
				</RankTableRow>
			))}
		</RankTable>
	);
}

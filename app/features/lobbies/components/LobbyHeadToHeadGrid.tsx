import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Table } from "~/components/Table";
import type { CommonUser } from "~/utils/kysely.server";
import * as Leaderboard from "../core/Leaderboard";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyHeadToHeadGrid.module.css";
import { LobbyPlayer } from "./LobbyPlayer";

/** Every player's set and map record against every other, the row player's point of view. */
export function LobbyHeadToHeadGrid({
	players,
}: {
	players: Array<Pick<CommonUser, "id" | "avatar" | "username">>;
}) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();

	const records = Leaderboard.headToHead(data.sets);

	return (
		<section className={styles.root}>
			<p className="text-xs text-lighter">
				{t("lobbies:leaderboard.headToHead.explanation")}
			</p>
			<Table noRowHover>
				<thead>
					<tr>
						<th>{t("lobbies:leaderboard.player")}</th>
						{players.map((opponent) => (
							<th key={opponent.id} className={styles.opponent}>
								<Avatar user={opponent} size="xxs" alt={opponent.username} />
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{players.map((player) => (
						<tr key={player.id} data-testid="lobby-head-to-head-row">
							<td>
								<LobbyPlayer user={player} />
							</td>
							{players.map((opponent) => (
								<HeadToHeadCell
									key={opponent.id}
									record={
										player.id === opponent.id
											? "SELF"
											: records[player.id]?.[opponent.id]
									}
								/>
							))}
						</tr>
					))}
				</tbody>
			</Table>
		</section>
	);
}

function HeadToHeadCell({
	record,
}: {
	record: Leaderboard.HeadToHeadRecord | "SELF" | undefined;
}) {
	if (record === "SELF") {
		return <td className={styles.cell} data-outcome="self" />;
	}

	if (!record) {
		return <td className={styles.cell}>-</td>;
	}

	const outcome =
		record.setWins > record.setLosses
			? "W"
			: record.setWins < record.setLosses
				? "L"
				: "even";

	return (
		<td className={styles.cell} data-outcome={outcome}>
			<span className={styles.sets}>
				{record.setWins}-{record.setLosses}
			</span>
			<span className={styles.maps}>
				{record.mapWins}-{record.mapLosses}
			</span>
		</td>
	);
}

import { Crown, LogOut, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { WeaponImage } from "~/components/Image";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { Table } from "~/components/Table";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyLeaderboardTab.module.css";
import { LobbyPlayerMenu } from "./LobbyPlayerMenu";

const WEAPONS_SHOWN = 4;

export function LobbyLeaderboardTab() {
	const { t } = useTranslation(["lobbies"]);
	const { data, waitlist } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");

	const userOf = (userId: number) =>
		data.lobby.participants.find((participant) => participant.id === userId) ??
		data.sets
			.flatMap((set) => set.participants)
			.find((participant) => participant.id === userId);

	return (
		<SendouTabPanel id={TAB_KEYS.LEADERBOARD}>
			<Table>
				<thead>
					<tr>
						<th>#</th>
						{isHost ? <th /> : null}
						<th>{t("lobbies:leaderboard.player")}</th>
						<th className={styles.number}>{t("lobbies:leaderboard.sets")}</th>
						<th className={styles.number}>{t("lobbies:leaderboard.maps")}</th>
						<th>{t("lobbies:leaderboard.weapons")}</th>
					</tr>
				</thead>
				<tbody>
					{data.leaderboard.map((row, i) => {
						const user = userOf(row.userId);

						return (
							<tr key={row.userId} data-testid="lobby-leaderboard-row">
								<td>{i + 1}</td>
								{isHost ? (
									<td>
										<LobbyPlayerMenu userId={row.userId} />
									</td>
								) : null}
								<td>
									{user ? (
										<span className={styles.player}>
											<Avatar user={user} size="xxs" />
											{user.username}
											<HostIndicator userId={row.userId} />
											<SittingOutIndicator userId={row.userId} />
											<LeftIndicator userId={row.userId} />
										</span>
									) : null}
								</td>
								<td className={styles.number}>
									{row.setWins}-{row.setLosses}
								</td>
								<td className={styles.number}>
									{row.mapWins}-{row.mapLosses}
									{row.mapWinPercentage !== null ? (
										<span className="text-lighter">
											{" "}
											({row.mapWinPercentage}%)
										</span>
									) : null}
								</td>
								<td>
									<span className={styles.weapons}>
										{row.weaponSplIds
											.slice(0, WEAPONS_SHOWN)
											.map((weaponSplId) => (
												<WeaponImage
													key={weaponSplId}
													weaponSplId={weaponSplId}
													variant="badge"
													size={24}
												/>
											))}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</Table>
			{waitlist.length > 0 ? (
				<section className={styles.waitlist}>
					<h3 className={styles.waitlistHeader}>
						{t("lobbies:participants.waitlist")}
					</h3>
					<ol className={styles.waitlistList}>
						{waitlist.map((participant, i) => (
							<li
								key={participant.id}
								className={styles.player}
								data-testid="lobby-waitlist-row"
							>
								<span className="text-lighter">{i + 1}.</span>
								<LobbyPlayerMenu userId={participant.id} />
								<Avatar user={participant} size="xxs" />
								{participant.username}
								<HostIndicator userId={participant.id} />
							</li>
						))}
					</ol>
				</section>
			) : null}
		</SendouTabPanel>
	);
}

function HostIndicator({ userId }: { userId: number }) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();

	if (userId !== data.lobby.hostUserId) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					size="miniscule"
					variant="minimal"
					icon={<Crown className="text-theme" />}
					aria-label="Host"
				/>
			}
		>
			<span className="text-xs">{t("lobbies:leaderboard.host")}</span>
		</SendouPopover>
	);
}

function LeftIndicator({ userId }: { userId: number }) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();

	const hasLeft = data.lobby.participants.every(
		(participant) => participant.id !== userId,
	);
	if (!hasLeft || data.lobby.endedAt !== null) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					size="miniscule"
					variant="minimal"
					icon={<LogOut />}
					aria-label="Left the lobby"
				/>
			}
		>
			<span className="text-xs" data-testid="lobby-left-popover">
				{t("lobbies:leaderboard.left")}
			</span>
		</SendouPopover>
	);
}

function SittingOutIndicator({ userId }: { userId: number }) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();

	const isSittingOut = data.lobby.participants.some(
		(participant) => participant.id === userId && participant.isSittingOut,
	);
	if (!isSittingOut) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					size="miniscule"
					variant="minimal"
					icon={<Pause />}
					aria-label="Sitting out"
					testId={`lobby-sitting-out-${userId}`}
				/>
			}
		>
			<span className="text-xs">{t("lobbies:sittingOut")}</span>
		</SendouPopover>
	);
}

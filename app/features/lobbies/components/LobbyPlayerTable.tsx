import clsx from "clsx";
import { Crown, LogOut, Pause } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Table } from "~/components/Table";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { CommonUser } from "~/utils/kysely.server";
import { useLobbyView } from "../lobbies-hooks";
import { LobbyPlayer } from "./LobbyPlayer";
import { LobbyPlayerMenu } from "./LobbyPlayerMenu";
import styles from "./LobbyPlayerTable.module.css";

export interface LobbyPlayerTableColumn<T> {
	header: string;
	isNumeric?: boolean;
	cell: (row: T) => React.ReactNode;
}

/** The lobby's players a row each: their place, the host's actions for them, the player and the given columns. */
export function LobbyPlayerTable<
	T extends { user: Pick<CommonUser, "id" | "avatar" | "username"> },
>({
	title,
	rows,
	columns,
	isNumbered,
	rowTestId,
}: {
	title?: string;
	rows: T[];
	columns: LobbyPlayerTableColumn<T>[];
	isNumbered?: boolean;
	rowTestId: string;
}) {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");

	if (rows.length === 0) return null;

	return (
		<section className={styles.root}>
			{title ? <h3 className={styles.title}>{title}</h3> : null}
			<Table>
				<thead>
					<tr>
						{isNumbered ? <th>#</th> : null}
						{isHost ? <th /> : null}
						<th>{t("lobbies:leaderboard.player")}</th>
						{columns.map((column) => (
							<th
								key={column.header}
								className={column.isNumeric ? styles.number : undefined}
							>
								{column.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr key={row.user.id} data-testid={rowTestId}>
							{isNumbered ? <td className={styles.number}>{i + 1}</td> : null}
							{isHost ? (
								<td className={styles.menu}>
									<LobbyPlayerMenu userId={row.user.id} />
								</td>
							) : null}
							<td className={styles.playerCell}>
								<span className={styles.player}>
									<LobbyPlayer user={row.user} />
									<HostIndicator userId={row.user.id} />
									<SittingOutIndicator userId={row.user.id} />
									<LeftIndicator userId={row.user.id} />
								</span>
							</td>
							{columns.map((column) => (
								<td
									key={column.header}
									className={clsx(styles.column, {
										[styles.number]: column.isNumeric,
									})}
								>
									{column.cell(row)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</Table>
		</section>
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

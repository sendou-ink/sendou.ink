import { useTranslation } from "react-i18next";
import { WeaponPool } from "~/components/match-page/WeaponPool";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { LobbyParticipantStatus } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyParticipants.module.css";
import { LobbyPlayerTable } from "./LobbyPlayerTable";

type Participant = ReturnType<
	typeof useLobbyView
>["data"]["lobby"]["participants"][number];

/** Everyone in the lobby before the room forms: who checked in, who signed up and the waitlist. */
export function LobbyParticipants() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();

	const withStatus = (status: LobbyParticipantStatus) =>
		data.lobby.participants.filter(
			(participant) => participant.status === status,
		);

	const spotsTaken = data.lobby.participants.filter(
		(participant) => participant.status !== "WAITLISTED",
	).length;

	return (
		<div className={styles.root}>
			<div className={styles.summary}>
				{t("lobbies:participants.count", {
					count: spotsTaken,
					cap: data.lobby.roomSize,
				})}
			</div>
			<LobbyParticipantTable
				title={t("lobbies:participants.checkedIn")}
				participants={withStatus("CHECKED_IN")}
			/>
			<LobbyParticipantTable
				title={t("lobbies:participants.signedUp")}
				participants={withStatus("REGISTERED")}
			/>
			<LobbyParticipantTable
				title={t("lobbies:participants.waitlist")}
				participants={withStatus("WAITLISTED")}
				isNumbered
			/>
			<LobbyLeftUserTable />
		</div>
	);
}

/** For the host, those who left the lobby and so still have its chat, to kick them out of it. */
export function LobbyLeftUserTable() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");

	if (!isHost || data.lobby.endedAt !== null) return null;

	return (
		<LobbyPlayerTable
			title={t("lobbies:leaderboard.left")}
			rows={data.lobby.leftUsers.map((user) => ({ user }))}
			rowTestId="lobby-left-user"
			columns={[]}
		/>
	);
}

/** Participants of the lobby a row each, with their weapon pool. */
export function LobbyParticipantTable({
	title,
	participants,
	isNumbered,
}: {
	title: string;
	participants: Participant[];
	isNumbered?: boolean;
}) {
	const { t } = useTranslation(["lobbies"]);

	return (
		<LobbyPlayerTable
			title={title}
			rows={participants.map((participant) => ({ user: participant }))}
			isNumbered={isNumbered}
			rowTestId="lobby-participant"
			columns={[
				{
					header: t("lobbies:leaderboard.weapons"),
					cell: ({ user }) =>
						user.weaponPool.length > 0 ? (
							<WeaponPool weapons={user.weaponPool} size={24} />
						) : null,
				},
			]}
		/>
	);
}

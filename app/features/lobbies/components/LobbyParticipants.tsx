import clsx from "clsx";
import { Check, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LocaleTime } from "~/components/LocaleTime";
import type { LobbyParticipantStatus } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyParticipants.module.css";
import { LobbyPlayerMenu } from "./LobbyPlayerMenu";

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
				<span>
					{t("lobbies:participants.count", {
						count: spotsTaken,
						cap: data.lobby.roomSize,
					})}
				</span>
				<span className="text-lighter">
					<LocaleTime
						inline
						date={data.lobby.startsAt}
						options={{
							weekday: "short",
							hour: "numeric",
							minute: "numeric",
						}}
					/>
				</span>
			</div>
			<ParticipantGroup
				title={t("lobbies:participants.checkedIn")}
				participants={withStatus("CHECKED_IN")}
				isCheckedIn
			/>
			<ParticipantGroup
				title={t("lobbies:participants.signedUp")}
				participants={withStatus("REGISTERED")}
			/>
			<ParticipantGroup
				title={t("lobbies:participants.waitlist")}
				participants={withStatus("WAITLISTED")}
				isNumbered
			/>
		</div>
	);
}

function ParticipantGroup({
	title,
	participants,
	isCheckedIn,
	isNumbered,
}: {
	title: string;
	participants: ReturnType<
		typeof useLobbyView
	>["data"]["lobby"]["participants"];
	isCheckedIn?: boolean;
	isNumbered?: boolean;
}) {
	const { data } = useLobbyView();

	if (participants.length === 0) return null;

	return (
		<section className={styles.group}>
			<h3 className={styles.groupTitle}>{title}</h3>
			<ol className={clsx(styles.list, { [styles.numbered]: isNumbered })}>
				{participants.map((participant) => (
					<li
						key={participant.id}
						className={styles.participant}
						data-testid="lobby-participant"
					>
						<LobbyPlayerMenu userId={participant.id} />
						<Avatar user={participant} size="xxs" />
						<span>{participant.username}</span>
						{participant.id === data.lobby.hostUserId ? (
							<Crown size={14} className="text-theme" aria-label="Host" />
						) : null}
						{isCheckedIn ? (
							<Check
								size={14}
								className="text-success"
								aria-label="Checked in"
							/>
						) : null}
					</li>
				))}
			</ol>
		</section>
	);
}

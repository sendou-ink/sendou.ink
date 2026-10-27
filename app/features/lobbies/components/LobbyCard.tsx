import { Lock, LogOut } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/elements/Button";
import { LocaleTime } from "~/components/LocaleTime";
import { useUser } from "~/features/auth/core/user";
import type { SerializeFrom } from "~/utils/remix";
import { lobbyPage } from "~/utils/urls";
import type { loader } from "../loaders/lobbies.server";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyCard.module.css";

type LobbyListItem = SerializeFrom<typeof loader>["running"][number];

export function LobbyCard({ lobby }: { lobby: LobbyListItem }) {
	const { t } = useTranslation(["lobbies"]);

	return (
		<div className={styles.card} data-testid="lobby-card">
			<div className={styles.header}>
				<Avatar
					size="xs"
					user={{ id: lobby.hostId, avatar: lobby.hostAvatar }}
					alt={lobby.hostUsername}
				/>
				<h3 className={styles.name}>{lobby.name}</h3>
				<div className={styles.headerRight}>
					{lobby.isPrivate ? (
						<Lock size={16} aria-label="Limited visibility" />
					) : null}
					<span className={styles.label} data-label={lobby.label}>
						{t(`lobbies:label.${lobby.label}`)}
					</span>
				</div>
			</div>
			<div className={styles.infoRow}>
				<LobbyInfoItem label={t("lobbies:card.start")}>
					<LocaleTime
						inline
						date={lobby.startsAt}
						options={{
							weekday: "short",
							month: "short",
							day: "numeric",
							hour: "numeric",
							minute: "numeric",
						}}
					/>
				</LobbyInfoItem>
				<LobbyInfoItem label={t("lobbies:card.players")}>
					{lobby.playerCount}/{lobby.roomSize}
				</LobbyInfoItem>
				<LobbyInfoItem label={t("lobbies:card.host")}>
					{lobby.hostUsername}
				</LobbyInfoItem>
				{lobby.viewerStatus && lobby.endedAt === null ? (
					<LobbyInfoItem label={t("lobbies:card.status")}>
						<span className={styles.viewerStatus}>
							{t(`lobbies:viewerStatus.${lobby.viewerStatus}`)}
						</span>
					</LobbyInfoItem>
				) : null}
			</div>
			<div className={styles.footer}>
				<LobbyCardActions lobby={lobby} />
			</div>
		</div>
	);
}

function LobbyInfoItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.infoItem}>
			<div className={styles.infoLabel}>{label}</div>
			<div className={styles.infoValue}>{children}</div>
		</div>
	);
}

function LobbyCardActions({ lobby }: { lobby: LobbyListItem }) {
	const { t } = useTranslation(["lobbies", "common"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	const isOpen = lobby.endedAt === null;
	const canJoin =
		isOpen && Boolean(user) && !lobby.viewerStatus && data.hasFriendCode;
	// in the room leaving might forfeit a set, done from the lobby page instead
	const canLeave =
		isOpen &&
		lobby.viewerStatus !== null &&
		lobby.viewerStatus !== "IN_ROOM" &&
		lobby.viewerStatus !== "SPECTATING";

	return (
		<>
			<LinkButton
				to={lobbyPage(lobby.id)}
				size="small"
				variant={canJoin ? "outlined" : undefined}
				testId="lobby-view-button"
			>
				{t("common:actions.view")}
			</LinkButton>
			{canJoin ? (
				<ActionButton
					schema={lobbyActionSchema}
					action="SIGN_UP"
					formAction={lobbyPage(lobby.id)}
					size="small"
					testId="lobby-join-button"
				>
					{t("common:actions.join")}
				</ActionButton>
			) : null}
			{canLeave ? (
				<ActionButton
					schema={lobbyActionSchema}
					action="LEAVE"
					formAction={lobbyPage(lobby.id)}
					size="small"
					variant="outlined-destructive"
					icon={<LogOut />}
					testId="lobby-leave-button"
					confirm={{
						dialogHeading: t("lobbies:leave.heading"),
						submitButtonText: t("lobbies:actions.leave"),
						submitButtonVariant: "destructive",
					}}
				>
					{t("lobbies:actions.leave")}
				</ActionButton>
			) : null}
		</>
	);
}

import type React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyDetails.module.css";

/** The lobby's settings and the host's description of it. */
export function LobbyDetails() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const { lobby } = data;

	return (
		<div className={styles.root} data-testid="lobby-details">
			<div className={styles.infoRow}>
				<DetailsItem label={t("lobbies:card.start")}>
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
				</DetailsItem>
				<DetailsItem label={t("lobbies:details.bestOf")}>
					Bo{lobby.bestOf}
				</DetailsItem>
				<DetailsItem label={t("lobbies:details.modes")}>
					{lobby.modes.map((mode) => (
						<ModeImage key={mode} mode={mode} size={20} />
					))}
				</DetailsItem>
				<DetailsItem label={t("lobbies:details.roomSize")}>
					{lobby.roomSize}
				</DetailsItem>
			</div>
			{lobby.description ? (
				<p className={styles.description} data-testid="lobby-description">
					{lobby.description}
				</p>
			) : null}
		</div>
	);
}

function DetailsItem({
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

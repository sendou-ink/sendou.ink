import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { WeaponPool } from "~/components/match-page/WeaponPool";
import { Table } from "~/components/Table";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import styles from "./LobbyApplications.module.css";
import { LobbyPlayer } from "./LobbyPlayer";

/** The host's pending applications to the lobby, each accepted (signing the applicant up) or declined. */
export function LobbyApplications() {
	const { t } = useTranslation(["lobbies", "common"]);
	const { data } = useLobbyView();

	if (data.lobby.applications.length === 0) return null;

	return (
		<section className={styles.root} data-testid="lobby-applications">
			<h3 className={styles.title}>{t("lobbies:applications.title")}</h3>
			<Table>
				<thead>
					<tr>
						<th>{t("lobbies:leaderboard.player")}</th>
						<th>{t("lobbies:leaderboard.weapons")}</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{data.lobby.applications.map((application) => (
						<tr key={application.id} data-testid="lobby-application">
							<td className={styles.playerCell}>
								<LobbyPlayer user={application} />
							</td>
							<td className={styles.weapons}>
								{application.weaponPool.length > 0 ? (
									<WeaponPool weapons={application.weaponPool} size={24} />
								) : null}
							</td>
							<td>
								<div className={styles.buttons}>
									<ActionButton
										schema={lobbyActionSchema}
										action="APPROVE_APPLICATION"
										fields={{ userId: application.id }}
										size="small"
										icon={<Check />}
										testId={`lobby-accept-application-${application.id}`}
									>
										{t("common:actions.accept")}
									</ActionButton>
									<ActionButton
										schema={lobbyActionSchema}
										action="DENY_APPLICATION"
										fields={{ userId: application.id }}
										size="small"
										variant="outlined-destructive"
										icon={<X />}
										testId={`lobby-decline-application-${application.id}`}
									>
										{t("common:actions.decline")}
									</ActionButton>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</Table>
		</section>
	);
}

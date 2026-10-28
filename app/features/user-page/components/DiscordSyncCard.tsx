import { RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { DISCORD_REFRESH_URL } from "~/utils/urls";
import styles from "./DiscordSyncCard.module.css";

export function DiscordSyncCard() {
	const { t } = useTranslation(["user"]);
	const location = useLocation();

	return (
		<section className={styles.card}>
			<div className={styles.header}>
				<h2 className={styles.title}>{t("user:discordSync.title")}</h2>
				<form method="post" action={DISCORD_REFRESH_URL}>
					<input type="hidden" name="returnTo" value={location.pathname} />
					<SendouButton size="miniscule" icon={<RefreshCcw />} type="submit">
						{t("user:discordSync.refresh")}
					</SendouButton>
				</form>
			</div>
			<p className={styles.description}>{t("user:discordSync.description")}</p>
		</section>
	);
}

import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { usePatrons } from "~/hooks/swr";
import {
	API_PAGE,
	CONTRIBUTIONS_PAGE,
	FAQ_PAGE,
	NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL,
	PRIVACY_POLICY_PAGE,
	SENDOU_INK_DISCORD_URL,
	SENDOU_INK_GITHUB_URL,
	SENDOU_LOVE_EMOJI_PATH,
	SUPPORT_PAGE,
	userPage,
} from "~/utils/urls";
import { Image } from "../Image";
import { DiscordIcon } from "../icons/Discord";
import { GitHubIcon } from "../icons/GitHub";
import { PatreonIcon } from "../icons/Patreon";
import styles from "./Footer.module.css";

export function Footer() {
	const { t } = useTranslation();

	const currentYear = new Date().getFullYear();

	return (
		<footer className={styles.footer}>
			<div className={styles.linkList}>
				<Link to={PRIVACY_POLICY_PAGE}>{t("pages.privacy")}</Link>
				<Link to={CONTRIBUTIONS_PAGE}>{t("pages.contributors")}</Link>
				<Link to={FAQ_PAGE}>{t("pages.faq")}</Link>
				<Link to={API_PAGE}>{t("pages.api")}</Link>
			</div>
			<div className={styles.socials}>
				<a
					className={styles.socialLink}
					href={SENDOU_INK_GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					<div className={styles.socialHeader}>
						GitHub<p>{t("footer.github.subtitle")}</p>
					</div>
					<GitHubIcon className={styles.socialIcon} />
				</a>
				<a
					className={styles.socialLink}
					href={SENDOU_INK_DISCORD_URL}
					target="_blank"
					rel="noreferrer"
				>
					<div className={styles.socialHeader}>
						Discord<p>{t("footer.discord.subtitle")}</p>
					</div>{" "}
					<DiscordIcon className={styles.socialIcon} />
				</a>
				<Link className={styles.socialLink} to={SUPPORT_PAGE}>
					<div className={styles.socialHeader}>
						Patreon<p>{t("footer.patreon.subtitle")}</p>
					</div>{" "}
					<PatreonIcon className={styles.socialIcon} />
				</Link>
			</div>
			<PatronsList />
			<div className={styles.copyrightNote}>
				<p>
					sendou.ink © Copyright of Sendou and contributors 2019-{currentYear}.
					Original content & source code is licensed under the AGPL-3.0 license.
				</p>
				<p>
					Splatoon is trademark & © of Nintendo 2014-{currentYear}. sendou.ink
					is not affiliated with Nintendo.
				</p>
				<p>
					Any tournaments hosted on sendou.ink are unofficial and Nintendo is
					not a sponsor or affiliated with them. Terms for participating in and
					viewing Community Tournaments using Nintendo Games can be found here:{" "}
					<a
						href={NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
						target="_blank"
						rel="noreferrer"
					>
						{NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
					</a>
				</p>
			</div>
		</footer>
	);
}

function PatronsList() {
	const { t } = useTranslation();
	const { patrons } = usePatrons();

	return (
		<div>
			<h4 className={styles.patronTitle}>
				{t("footer.thanks")}
				<Image alt="" path={SENDOU_LOVE_EMOJI_PATH} width={24} height={24} />
			</h4>
			<ul className={styles.patronList}>
				{patrons?.map((patron) => (
					<li key={patron.id}>
						<Link to={userPage(patron)} className={styles.patron}>
							{patron.username}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

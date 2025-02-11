import { Link } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { usePatrons } from "~/hooks/swr";
import {
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

function _Footer() {
	const { t } = useTranslation();

	const currentYear = new Date().getFullYear();

	return (
		<footer className="layout__footer">
			<div className="layout__footer__link-list">
				<Link to={PRIVACY_POLICY_PAGE}>{t("pages.privacy")}</Link>
				<Link to={CONTRIBUTIONS_PAGE}>{t("pages.contributors")}</Link>
				<Link to={FAQ_PAGE}>{t("pages.faq")}</Link>
			</div>
			<div className="layout__footer__socials">
				<a
					className="layout__footer__social-link"
					href={SENDOU_INK_GITHUB_URL}
					target="_blank"
					rel="noreferrer"
				>
					<div className="layout__footer__social-header">
						GitHub<p>{t("footer.github.subtitle")}</p>
					</div>
					<GitHubIcon className="layout__footer__social-icon github" />
				</a>
				<a
					className="layout__footer__social-link"
					href={SENDOU_INK_DISCORD_URL}
					target="_blank"
					rel="noreferrer"
				>
					<div className="layout__footer__social-header">
						Discord<p>{t("footer.discord.subtitle")}</p>
					</div>{" "}
					<DiscordIcon className="layout__footer__social-icon discord" />
				</a>
				<Link className="layout__footer__social-link" to={SUPPORT_PAGE}>
					<div className="layout__footer__social-header">
						Patreon<p>{t("footer.patreon.subtitle")}</p>
					</div>{" "}
					<PatreonIcon className="layout__footer__social-icon patreon" />
				</Link>
			</div>
			<PatronsList />
			<div className="layout__copyright-note">
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
			<h4 className="layout__footer__patron-title">
				{t("footer.thanks")}
				<Image alt="" path={SENDOU_LOVE_EMOJI_PATH} width={24} height={24} />
			</h4>
			<ul className="layout__footer__patron-list">
				{patrons?.map((patron) => (
					<li key={patron.id}>
						<Link
							to={userPage(patron)}
							className="layout__footer__patron-list__patron"
						>
							{patron.username}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export const Footer = React.memo(_Footer);

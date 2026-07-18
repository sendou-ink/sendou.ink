import { Trans, useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SENDOU_INK_DISCORD_URL } from "~/utils/urls";
import styles from "./HowToLinkPopover.module.css";

const EXAMPLE_PLAYER_URL = "https://sendou.ink/xsearch/player/0";

export function HowToLinkPopover() {
	const { t } = useTranslation(["common"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" size="small" className="self-start">
					{t("common:xsearch.link.trigger")}
				</SendouButton>
			}
		>
			<div className={styles.content}>
				<div>
					<div className="font-bold">
						{t("common:xsearch.link.about.title")}
					</div>
					<ul className={styles.list}>
						<li>{t("common:xsearch.link.about.endPower")}</li>
						<li>{t("common:xsearch.link.about.notPeak")}</li>
						<li>{t("common:xsearch.link.about.wait")}</li>
					</ul>
				</div>
				<div className="stack sm">
					<div>
						<Trans t={t} i18nKey="common:xsearch.link.example">
							Post this message on our Discord (
							<a href={SENDOU_INK_DISCORD_URL} target="_blank" rel="noreferrer">
								discord.gg/sendou
							</a>
							), on the #helpdesk channel:
						</Trans>
					</div>
					<code className={styles.example}>
						{t("common:xsearch.link.exampleRequest")} {EXAMPLE_PLAYER_URL}
					</code>
				</div>
				<div className="text-lighter">
					{t("common:xsearch.link.noScreenshots")}
				</div>
			</div>
		</SendouPopover>
	);
}

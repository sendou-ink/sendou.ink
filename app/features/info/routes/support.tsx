import type { MetaFunction } from "@remix-run/node";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/Button";
import { Main } from "~/components/Main";
import { Popover } from "~/components/Popover";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { useSetTitle } from "~/hooks/useSetTitle";
import { makeTitle } from "~/utils/strings";
import {
	PATREON_HOW_TO_CONNECT_DISCORD_URL,
	SENDOU_INK_PATREON_URL,
} from "~/utils/urls";

import "../support.css";

export const meta: MetaFunction = () => {
	return [{ title: makeTitle("Support") }];
};

// 1 = support
// 2 = supporter
// 3 = supporter+
const PERKS = [
	{
		tier: 1,
		name: "supportMyWork",
		extraInfo: false,
	},
	{
		tier: 1,
		name: "adFree",
		extraInfo: false,
	},
	{
		tier: 1,
		name: "nameInFooter",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "privateDiscord",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "prioritySupport",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "customizedColorsUser",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "customizedColorsTeam",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "badge",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "discordColorRole",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "chatColor",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "seePlusPercentage",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "autoValidatePictures",
		extraInfo: true,
	},
	{
		tier: 2,
		name: "previewQ",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "joinFive",
		extraInfo: false,
	},
	{
		tier: 2,
		name: "tournamentsBeta",
		extraInfo: false,
	},
] as const;

export default function SupportPage() {
	const { t } = useTranslation();
	useSetTitle(t("pages.support"));

	return (
		<Main className="stack lg">
			<div className="stack md">
				<p>{t("support.intro.first")}</p>
				<p>{t("support.intro.second")}</p>
				<SupportTable />
			</div>
			<LinkButton
				size="big"
				to={SENDOU_INK_PATREON_URL}
				isExternal
				className="mx-auto"
			>
				{t("support.action")}
			</LinkButton>
			<p className="text-sm text-lighter">
				<Trans t={t} i18nKey="support.footer">
					After becoming a new patron you should connect{" "}
					<a
						href={PATREON_HOW_TO_CONNECT_DISCORD_URL}
						target="_blank"
						rel="noreferrer"
					>
						your Discord on Patreon.com
					</a>
					. Afterwards the perks will take effect within 2 hours. If any
					questions or problems contact Sendou for support.
				</Trans>
			</p>
		</Main>
	);
}

function SupportTable() {
	const { t } = useTranslation();
	return (
		<div className="support__table">
			<div />
			<div>Support</div>
			<div>Supporter</div>
			<div>Supporter+</div>
			{PERKS.map((perk) => {
				return (
					<React.Fragment key={perk.name}>
						<div className="justify-self-start">
							{t(`support.perk.${perk.name}`)}
							{perk.extraInfo ? (
								<Popover
									containerClassName="support__popover"
									triggerClassName="support__popover-trigger"
									buttonChildren={<>?</>}
								>
									{t(`support.perk.${perk.name}.extra` as any)}
								</Popover>
							) : null}
						</div>
						<div>
							{perk.tier === 1 ? (
								<CheckmarkIcon className="support__checkmark" />
							) : null}
						</div>
						{perk.name === "badge" ? (
							<div>
								<Badge
									isAnimated
									badge={{ code: "patreon", displayName: "" }}
									size={32}
								/>
							</div>
						) : (
							<div>
								{perk.tier <= 2 ? (
									<CheckmarkIcon className="support__checkmark" />
								) : null}
							</div>
						)}
						{perk.name === "badge" ? (
							<div>
								<Badge
									isAnimated
									badge={{
										code: "patreon_plus",
										displayName: "",
									}}
									size={32}
								/>
							</div>
						) : (
							<div>
								{perk.tier <= 3 ? (
									<CheckmarkIcon className="support__checkmark" />
								) : null}
							</div>
						)}
					</React.Fragment>
				);
			})}
		</div>
	);
}

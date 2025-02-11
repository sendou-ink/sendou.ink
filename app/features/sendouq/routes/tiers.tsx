import type { MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { TierImage } from "~/components/Image";
import { Main } from "~/components/Main";
import {
	TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
	TIERS,
	USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
} from "~/features/mmr/mmr-constants";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills } from "~/features/mmr/tiered.server";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Tiers",
		description:
			"Information about the tiers in SendouQ. From Leviathan+ to Iron.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export const loader = () => {
	const season = currentOrPreviousSeason(new Date());
	const { intervals } = userSkills(season!.nth);

	return {
		intervals,
	};
};

export default function TiersPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q"]);

	return (
		<Main halfWidth className="stack md">
			{TIERS.map((tier) => {
				const neededOrdinal = data.intervals.find(
					(i) => !i.isPlus && i.name === tier.name,
				)?.neededOrdinal;
				return (
					<div key={tier.name} className="stack horizontal sm items-center">
						<TierImage tier={{ isPlus: false, name: tier.name }} width={150} />
						<div>
							<div className="text-lg font-bold">{tier.name}</div>
							<div className="text-lg font-bold text-lighter">
								{tier.percentile}%
							</div>
							{neededOrdinal ? (
								<>
									<div className="text-xs font-semi-bold text-lighter">
										{t("q:tiers.currentCriteria")}
									</div>
									<div className="text-sm font-semi-bold text-lighter">
										{ordinalToSp(neededOrdinal)}SP
									</div>
								</>
							) : null}
						</div>
					</div>
				);
			})}
			<p>{t("q:tiers.info.p1")}</p>
			<p>
				{t("q:tiers.info.p2", {
					usersMin: USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
					teamsMin: TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN,
				})}
			</p>
			<div>
				{t("q:tiers.info.p3")}
				<TierImage tier={{ isPlus: true, name: "BRONZE" }} width={32} />
			</div>
		</Main>
	);
}

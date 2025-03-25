import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { MAX_AP } from "~/constants";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import { loader } from "../loaders/builds.$slug.stats.server";
export { loader };

import "../build-stats.css";

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: `${args.data.weaponName} popular abilities`,
		ogTitle: `${args.data.weaponName} Splatoon 3 popular abilities`,
		description: `List of the most popular abilities for ${args.data.weaponName} in Splatoon 3.`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "analyzer"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("builds"),
				href: BUILDS_PAGE,
				type: "IMAGE",
			},
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: weaponBuildPage(data.meta.slug),
				type: "IMAGE",
			},
			{
				href: "/",
				text: data.meta.breadcrumbText,
				type: "TEXT",
			},
		];
	},
};

export default function BuildStatsPage() {
	const { t } = useTranslation(["weapons", "builds", "analyzer"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth className="stack lg">
			<div className="text-xs text-lighter font-bold">
				{t("builds:stats.count.title", {
					count: data.stats.weaponBuildsCount,
					weapon: t(`weapons:MAIN_${data.weaponId}`),
				})}
			</div>
			<div className="stack md">
				<h2 className="text-lg">{t("builds:stats.ap.title")}</h2>
				<div className="stack md">
					{data.stats.stackableAbilities.map((stats) => {
						const apToPx = (ap: number) =>
							Math.floor(
								(ap / data.stats.stackableAbilities[0].apAverage.weapon) * 200,
							);

						return (
							<div key={stats.name} className="build-stats__ability-row">
								<div>
									<Ability ability={stats.name} size="SUB" />
								</div>
								<div className="build-stats__bars">
									<div>
										<WeaponImage
											variant="badge"
											weaponSplId={data.weaponId}
											width={22}
										/>{" "}
									</div>
									<div>
										{stats.apAverage.weapon} {t("analyzer:abilityPoints.short")}
									</div>{" "}
									<div
										className="build-stats__bar"
										style={{ width: `${apToPx(stats.apAverage.weapon)}px` }}
									/>
									<div className="text-xs text-lighter font-bold justify-self-center">
										{t("builds:stats.all")}
									</div>
									<div>
										{stats.apAverage.all} {t("analyzer:abilityPoints.short")}
									</div>{" "}
									<div
										className="build-stats__bar"
										style={{ width: `${apToPx(stats.apAverage.all)}px` }}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="stack md">
				<h2 className="text-lg">{t("builds:stats.percentage.title")}</h2>
				<div className="stack md">
					{data.stats.mainOnlyAbilities.map((stats) => {
						const percentageToPx = (ap: number) =>
							Math.floor((ap / MAX_AP) * 125);

						return (
							<div key={stats.name} className="build-stats__ability-row">
								<Ability ability={stats.name} size="SUB" />
								<div className="build-stats__bars">
									<div>
										<WeaponImage
											variant="badge"
											weaponSplId={data.weaponId}
											width={22}
										/>{" "}
									</div>
									<div>{stats.percentage.weapon}%</div>{" "}
									<div
										className="build-stats__bar"
										style={{
											width: `${percentageToPx(stats.percentage.weapon)}px`,
										}}
									/>
									<div className="text-xs text-lighter font-bold justify-self-center">
										{t("builds:stats.all")}
									</div>
									<div>{stats.percentage.all}%</div>{" "}
									<div
										className="build-stats__bar"
										style={{
											width: `${percentageToPx(stats.percentage.all)}px`,
										}}
									/>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</Main>
	);
}

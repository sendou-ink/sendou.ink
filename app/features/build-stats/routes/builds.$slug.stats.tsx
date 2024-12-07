import { cachified } from "@epic-web/cachified";
import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { MAX_AP, ONE_HOUR_IN_MS } from "~/constants";
import { i18next } from "~/modules/i18n/i18next.server";
import { cache, ttl } from "~/utils/cache.server";
import {
	type SendouRouteHandle,
	notFoundIfNullLike,
} from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import { abilityPointCountsToAverages } from "../build-stats-utils";
import { averageAbilityPoints } from "../queries/averageAbilityPoints.server";

import "../build-stats.css";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [{ title: data.meta.title }];
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

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["builds", "weapons", "common"]);
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(params.slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const cachedStats = await cachified({
		key: `build-stats-${weaponId}`,
		cache,
		ttl: ttl(ONE_HOUR_IN_MS),
		async getFreshValue() {
			return abilityPointCountsToAverages({
				allAbilities: averageAbilityPoints(),
				weaponAbilities: averageAbilityPoints(weaponId),
			});
		},
	});

	return {
		stats: cachedStats,
		weaponId,
		meta: {
			slug: params.slug!,
			title: makeTitle([
				t("builds:linkButton.abilityStats"),
				weaponName,
				t("common:pages.builds"),
			]),
			breadcrumbText: t("builds:linkButton.abilityStats"),
		},
	};
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

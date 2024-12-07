import { cachified } from "@epic-web/cachified";
import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { Main } from "~/components/Main";
import { ONE_HOUR_IN_MS } from "~/constants";
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
import { popularBuilds } from "../build-stats-utils";
import { abilitiesByWeaponId } from "../queries/abilitiesByWeaponId.server";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [{ title: data.meta.title }];
};

export const handle: SendouRouteHandle = {
	i18n: ["analyzer", "builds"],
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
				imgPath: outlinedMainWeaponImageUrl(data.meta.weaponId),
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
	const slug = params.slug;
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const cachedPopularBuilds = await cachified({
		key: `popular-builds-${weaponId}`,
		cache,
		ttl: ttl(ONE_HOUR_IN_MS),
		async getFreshValue() {
			return popularBuilds(abilitiesByWeaponId(weaponId));
		},
	});

	return {
		popularBuilds: cachedPopularBuilds,
		meta: {
			weaponId,
			slug: slug!,
			title: makeTitle([
				t("builds:linkButton.popularBuilds"),
				weaponName,
				t("common:pages.builds"),
			]),
			breadcrumbText: t("builds:linkButton.popularBuilds"),
		},
	};
};

export default function PopularBuildsPage() {
	const { t } = useTranslation(["analyzer", "builds"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			{data.popularBuilds.length === 0 && (
				<div className="text-lg text-lighter text-center">
					{t("builds:noPopularBuilds")}
				</div>
			)}
			{data.popularBuilds.map((build, i) => {
				return (
					<div key={build.id} className="stack horizontal lg items-center">
						<div
							className={clsx("stack items-center", {
								invisible: !build.count,
							})}
						>
							<div className="text-lg text-lighter font-bold">#{i + 1}</div>
							<div className="text-sm font-semi-bold text-theme">
								×{build.count}
							</div>
						</div>{" "}
						<div className="stack horizontal md flex-wrap">
							{build.abilities.map(({ ability, count }) => {
								return (
									<div
										key={ability}
										className="text-sm font-semi-bold stack xs items-center"
									>
										<Ability ability={ability} size="SUB" />{" "}
										<div className={clsx({ invisible: !count })}>
											{count}
											{t("analyzer:abilityPoints.short")}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</Main>
	);
}

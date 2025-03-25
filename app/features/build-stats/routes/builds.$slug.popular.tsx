import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import { loader } from "../loaders/builds.$slug.popular.server";
export { loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: `${args.data.weaponName} popular builds`,
		ogTitle: `${args.data.weaponName} Splatoon 3 popular builds`,
		description: `List of most popular ability combinations for ${args.data.weaponName}.`,
		location: args.location,
	});
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

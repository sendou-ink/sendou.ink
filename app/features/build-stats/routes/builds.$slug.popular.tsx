import { Layers, Shapes } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Ability } from "~/components/Ability";
import { EmptyState } from "~/components/EmptyState";
import { SendouSection } from "~/components/elements/Section";
import { WeaponBuildsLayout } from "~/features/builds/components/WeaponBuildsLayout";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import {
	metaTags,
	ogPageImage,
	type SerializeFrom,
} from "../../../utils/remix";
import { ANY_TIME } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import { BuildStatsDateFilter } from "../components/BuildStatsDateFilter";
import { PopularBuildCard } from "../components/PopularBuildCard";
import { loader } from "../loaders/builds.$slug.popular.server";
import styles from "./builds.$slug.popular.module.css";

export { loader };

export const shouldRevalidate = buildStatsSearchParams.shouldRevalidate;

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	return metaTags({
		title: `${args.loaderData.weaponName} popular builds`,
		ogTitle: `${args.loaderData.weaponName} Splatoon 3 popular builds`,
		description: `List of most popular ability combinations for ${args.loaderData.weaponName}.`,
		image: ogPageImage("builds"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds"],
	breadcrumb: ({ match }) => {
		const data = match.loaderData as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("builds"),
				href: BUILDS_PAGE,
				type: "IMAGE",
			},
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: weaponBuildPage(data.slug),
				type: "IMAGE",
			},
		];
	},
};

type PopularData = SerializeFrom<typeof loader>["popular"];

export default function PopularBuildsPage() {
	const { t } = useTranslation(["builds"]);
	const data = useLoaderData<typeof loader>();

	return (
		<WeaponBuildsLayout
			weaponId={data.weaponId}
			weaponName={data.weaponName}
			slug={data.slug}
			buildsCount={data.buildsCount}
			selectedTab="popular"
		>
			<div className="stack md-plus">
				<BuildStatsDateFilter loaderDate={data.date} />
				{data.popular.builds.length === 0 ? (
					<EmptyState navItem="builds">
						{data.date === ANY_TIME
							? t("builds:noBuildsForWeapon")
							: t("builds:noBuildsMatchingFilters")}
					</EmptyState>
				) : (
					<div className={styles.columns}>
						<PopularBuilds popular={data.popular} />
						<aside className="stack md-plus">
							<Staples popular={data.popular} />
							<BuildVariety popular={data.popular} />
						</aside>
					</div>
				)}
			</div>
		</WeaponBuildsLayout>
	);
}

function PopularBuilds({ popular }: { popular: PopularData }) {
	const { t } = useTranslation(["builds"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			<ol className={styles.builds}>
				{popular.builds.map((build) => (
					<PopularBuildCard
						key={build.id}
						build={build}
						mostPopularPlayersCount={popular.builds[0].playersCount}
						weaponId={data.weaponId}
						slug={data.slug}
					/>
				))}
			</ol>
			<p className="text-xs text-lighter text-center">
				{t("builds:popular.explanation", { weapon: data.weaponName })}
			</p>
		</div>
	);
}

function Staples({ popular }: { popular: PopularData }) {
	const { t } = useTranslation(["builds", "game-misc"]);

	return (
		<SendouSection title={t("builds:popular.staples.title")} icon={Layers}>
			<p className="text-xs text-lighter">
				{t("builds:popular.staples.explanation", {
					count: popular.builds.length,
				})}
			</p>
			<ul className={styles.staples}>
				{popular.staples.map((staple) => (
					<li key={staple.ability} className={styles.staple}>
						<Ability ability={staple.ability} size="SUBTINY" />
						<div className="stack xxs">
							<div className="stack horizontal sm justify-between text-xs">
								<span className="truncate">
									{t(`game-misc:ABILITY_${staple.ability}`)}
								</span>
								<span className="font-semi-bold">
									{staple.buildsCount}/{popular.builds.length}
								</span>
							</div>
							<progress
								className={styles.bar}
								value={staple.buildsCount}
								max={popular.builds.length}
								aria-label={t(`game-misc:ABILITY_${staple.ability}`)}
							/>
						</div>
					</li>
				))}
			</ul>
		</SendouSection>
	);
}

function BuildVariety({ popular }: { popular: PopularData }) {
	const { t } = useTranslation(["builds"]);

	return (
		<SendouSection title={t("builds:popular.variety.title")} icon={Shapes}>
			<dl className={styles.varietyNumbers}>
				<div>
					<dt className="text-xs text-lighter">
						{t("builds:popular.variety.players")}
					</dt>
					<dd className={styles.varietyNumber}>{popular.playersCount}</dd>
				</div>
				<div>
					<dt className="text-xs text-lighter">
						{t("builds:popular.variety.uniqueBuilds")}
					</dt>
					<dd className={styles.varietyNumber}>{popular.uniqueBuildsCount}</dd>
				</div>
			</dl>
			<div className="stack xs">
				<progress
					className={styles.bar}
					value={popular.topBuildsPercentage}
					max={100}
					aria-label={`${popular.topBuildsPercentage}%`}
				/>
				<p className="text-xs">
					{t("builds:popular.variety.topBuildsShare", {
						percentage: popular.topBuildsPercentage,
						count: popular.topBuildsCount,
					})}
				</p>
			</div>
		</SendouSection>
	);
}

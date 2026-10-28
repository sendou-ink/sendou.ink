import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { BuildCard } from "~/components/BuildCard";
import { EmptyState } from "~/components/EmptyState";
import { Flipper } from "~/components/Flipper";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import { buildsSearchParams } from "../builds-search-params";
import type { BuildWeaponWithTop500Info } from "../builds-types";
import {
	BuildFiltersLayout,
	ClearFiltersButton,
} from "../components/BuildFilters";
import { BuildStack } from "../components/BuildStack";
import { WeaponBuildsLayout } from "../components/WeaponBuildsLayout";
import { loader } from "../loaders/builds.$slug.server";
import styles from "./builds.$slug.module.css";

export { loader };

export const shouldRevalidate = buildsSearchParams.shouldRevalidate;

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	return metaTags({
		title: `${args.loaderData.weaponName} builds`,
		ogTitle: `${args.loaderData.weaponName} Splatoon 3 builds`,
		description: `Collection of ${args.loaderData.weaponName} builds from the top competitive players. Find the best combination of abilities and level up your gameplay.`,
		image: ogPageImage("builds"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear", "analyzer"],
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

function BuildCards({ data }: { data: SerializeFrom<typeof loader> }) {
	const [expandedOwnerIds, setExpandedOwnerIds] = React.useState<
		ReadonlySet<number>
	>(new Set());

	const toggleExpanded = (ownerId: number) =>
		setExpandedOwnerIds((ownerIds) => {
			const newOwnerIds = new Set(ownerIds);
			if (newOwnerIds.has(ownerId)) {
				newOwnerIds.delete(ownerId);
			} else {
				newOwnerIds.add(ownerId);
			}

			return newOwnerIds;
		});

	const card =
		(build: SerializeFrom<typeof loader>["builds"][number]) =>
		(stackToggle: React.ReactNode) => (
			<BuildCard
				build={{
					...build,
					weapons: viewedWeaponFirst(build.weapons, data.weaponId),
				}}
				owner={{ ...build.owner, plusTier: build.plusTier }}
				ownerAction={stackToggle}
				canEdit={false}
			/>
		);

	return (
		<Flipper flipKey={expandedOwnerIds} className={styles.buildsContainer}>
			{groupByOwner(data.builds).flatMap(([build, ...otherBuilds]) => {
				const isExpanded = expandedOwnerIds.has(build.owner.id);

				return [
					<BuildStack
						key={build.id}
						buildId={build.id}
						stack={
							otherBuilds.length > 0
								? {
										buildIds: otherBuilds.map((b) => b.id),
										isExpanded,
										onToggle: () => toggleExpanded(build.owner.id),
									}
								: undefined
						}
					>
						{card(build)}
					</BuildStack>,
					...(isExpanded
						? otherBuilds.map((otherBuild) => (
								<BuildStack key={otherBuild.id} buildId={otherBuild.id}>
									{card(otherBuild)}
								</BuildStack>
							))
						: []),
				];
			})}
		</Flipper>
	);
}

export default function WeaponsBuildsPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "builds"]);
	const [{ abilities: abilityConditions, mode, date }, setParams] =
		useSearchParamsTyped(buildsSearchParams);

	const pagination = useSearchParamPagination({
		definition: buildsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	const hasFilters =
		abilityConditions.length > 0 || mode !== null || date !== null;
	const clearFilters = () =>
		setParams({ abilities: [], mode: null, date: null });

	return (
		<WeaponBuildsLayout
			weaponId={data.weaponId}
			weaponName={data.weaponName}
			slug={data.slug}
			buildsCount={data.buildsCount}
			selectedTab="builds"
		>
			<BuildFiltersLayout
				values={{ abilities: abilityConditions, mode, date }}
				onChange={setParams}
				onClearAll={clearFilters}
				filteredBuildsCount={data.filteredBuildsCount}
				pagination={pagination}
			>
				{data.builds.length > 0 ? (
					<BuildCards data={data} />
				) : (
					<EmptyState
						navItem="builds"
						action={
							hasFilters ? <ClearFiltersButton onClick={clearFilters} /> : null
						}
					>
						{hasFilters
							? t("builds:noBuildsMatchingFilters")
							: t("builds:noBuildsForWeapon")}
					</EmptyState>
				)}
			</BuildFiltersLayout>
		</WeaponBuildsLayout>
	);
}

function viewedWeaponFirst(
	weapons: Array<BuildWeaponWithTop500Info>,
	viewedWeaponId: MainWeaponId,
) {
	const isViewed = (weapon: BuildWeaponWithTop500Info) =>
		canonicalWeaponSplId(weapon.weaponSplId) === viewedWeaponId;

	return [...weapons.filter(isViewed), ...weapons.filter((w) => !isViewed(w))];
}

/** Groups in the order each owner first appears, so a stack takes the place of its owner's top build. */
function groupByOwner<T extends { owner: { id: number } }>(builds: T[]) {
	const groups = new Map<number, [T, ...T[]]>();
	for (const build of builds) {
		const group = groups.get(build.owner.id);
		if (group) {
			group.push(build);
		} else {
			groups.set(build.owner.id, [build]);
		}
	}

	return [...groups.values()];
}

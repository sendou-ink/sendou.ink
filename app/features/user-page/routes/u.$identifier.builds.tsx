import { ArrowDownNarrowWide, Lock, LockOpen, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData, useMatches } from "react-router";
import { AddNewButton } from "~/components/AddNewButton";
import { BuildCard } from "~/components/BuildCard";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FormMessage } from "~/components/FormMessage";
import { Image, WeaponImage } from "~/components/Image";
import { SubmitButton } from "~/components/SubmitButton";
import { BUILD_SORT_IDENTIFIERS, type BuildSort } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userNewBuildPage, weaponCategoryUrl } from "~/utils/urls";
import { action } from "../actions/u.$identifier.builds.server";
import {
	loader,
	type UserBuildsPageData,
} from "../loaders/u.$identifier.builds.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { DEFAULT_BUILD_SORT } from "../user-page-constants";
export { loader, action };

import userStyles from "../user-page.module.css";
import styles from "./u.$identifier.builds.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear"],
};

type BuildFilter = "ALL" | "PUBLIC" | "PRIVATE" | MainWeaponId;

export default function UserBuildsPage() {
	const { t } = useTranslation(["builds", "user"]);
	const user = useUser();
	const layoutData = useMatches().at(-2)!.data as UserPageLoaderData;
	const data = useLoaderData<typeof loader>();
	const [weaponFilter, setWeaponFilter] = useSearchParamState<BuildFilter>({
		defaultValue: "ALL",
		name: "weapon",
		revive: (value) =>
			["ALL", "PUBLIC", "PRIVATE"].includes(value)
				? (value as BuildFilter)
				: mainWeaponIds.find((id) => id === Number(value)),
	});

	const isOwnPage = user?.id === layoutData.user.id;
	const [changingSorting, setChangingSorting] = useSearchParamState({
		defaultValue: false,
		name: "sorting",
		revive: (value) => value === "true" && isOwnPage,
	});

	const closeSortingDialog = React.useCallback(
		() => setChangingSorting(false),
		[setChangingSorting],
	);

	const builds =
		weaponFilter === "ALL"
			? data.builds
			: weaponFilter === "PUBLIC"
				? data.builds.filter((build) => !build.private)
				: weaponFilter === "PRIVATE"
					? data.builds.filter((build) => build.private)
					: data.builds.filter((build) =>
							build.weapons
								.map((wpn) => wpn.weaponSplId)
								.includes(weaponFilter),
						);

	return (
		<div className="stack lg">
			{changingSorting ? (
				<ChangeSortingDialog close={closeSortingDialog} />
			) : null}
			{isOwnPage && (
				<div className="stack sm horizontal items-center justify-end">
					<SendouButton
						onPress={() => setChangingSorting(true)}
						size="small"
						variant="outlined"
						icon={<ArrowDownNarrowWide />}
						data-testid="change-sorting-button"
					>
						{t("user:builds.sorting.changeButton")}
					</SendouButton>
					<AddNewButton navIcon="builds" to={userNewBuildPage(user)} />
				</div>
			)}
			<BuildsFilters
				weaponFilter={weaponFilter}
				setWeaponFilter={setWeaponFilter}
			/>
			{builds.length > 0 ? (
				<div className={styles.buildsContainer}>
					{builds.map((build) => (
						<BuildCard key={build.id} build={build} canEdit={isOwnPage} />
					))}
				</div>
			) : (
				<div className="text-center text-lg text-lighter font-semi-bold">
					{t("noBuilds")}
				</div>
			)}
		</div>
	);
}

function BuildsFilters({
	weaponFilter,
	setWeaponFilter,
}: {
	weaponFilter: BuildFilter;
	setWeaponFilter: (weaponFilter: BuildFilter) => void;
}) {
	const { t } = useTranslation(["weapons", "builds"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const layoutData = useMatches().at(-2)!.data as UserPageLoaderData;

	if (data.builds.length === 0) return null;

	const privateBuildsCount = data.builds.filter(
		(build) => build.private,
	).length;
	const publicBuildsCount = data.builds.length - privateBuildsCount;

	const showPublicPrivateFilters =
		user?.id === layoutData.user.id && privateBuildsCount > 0;

	return (
		<div className="stack horizontal sm flex-wrap">
			<SendouButton
				onPress={() => setWeaponFilter("ALL")}
				variant={weaponFilter === "ALL" ? undefined : "outlined"}
				size="small"
				className={userStyles.buildFilterButton}
			>
				{t("builds:stats.all")} ({data.builds.length})
			</SendouButton>
			{showPublicPrivateFilters ? (
				<>
					<SendouButton
						onPress={() => setWeaponFilter("PUBLIC")}
						variant={weaponFilter === "PUBLIC" ? undefined : "outlined"}
						size="small"
						className={userStyles.buildFilterButton}
						icon={<LockOpen />}
					>
						{t("builds:stats.public")} ({publicBuildsCount})
					</SendouButton>
					<SendouButton
						onPress={() => setWeaponFilter("PRIVATE")}
						variant={weaponFilter === "PRIVATE" ? undefined : "outlined"}
						size="small"
						className={userStyles.buildFilterButton}
						icon={<Lock />}
					>
						{t("builds:stats.private")} ({privateBuildsCount})
					</SendouButton>
				</>
			) : null}

			<WeaponFilterMenu
				mainWeaponIds={mainWeaponIds}
				counts={data.weaponCounts}
				weaponFilter={weaponFilter}
				setWeaponFilter={setWeaponFilter}
			/>
		</div>
	);
}

const MISSING_SORT_VALUE = "null";
function ChangeSortingDialog({ close }: { close: () => void }) {
	const data = useLoaderData<typeof loader>();
	const [buildSorting, setBuildSorting] = React.useState<
		ReadonlyArray<BuildSort | null>
	>(() => {
		if (!data.buildSorting) return [...DEFAULT_BUILD_SORT, null];
		if (data.buildSorting.length === BUILD_SORT_IDENTIFIERS.length)
			return data.buildSorting;

		return [...data.buildSorting, null];
	});
	const { t } = useTranslation(["common", "user"]);
	const fetcher = useFetcher();

	React.useEffect(() => {
		if (fetcher.state !== "loading") return;

		close();
	}, [fetcher.state, close]);

	const canAddMoreSorting = buildSorting.length < BUILD_SORT_IDENTIFIERS.length;

	const changeSorting = (idx: number, newIdentifier: BuildSort | null) => {
		const newSorting = buildSorting.map((oldIdentifier, i) =>
			i === idx ? newIdentifier : oldIdentifier,
		);

		if (canAddMoreSorting && newSorting[newSorting.length - 1] !== null) {
			newSorting.push(null);
		}

		setBuildSorting(newSorting);
	};

	const deleteLastSorting = () => {
		setBuildSorting((prev) => [...prev.filter(Boolean).slice(0, -1), null]);
	};

	return (
		<SendouDialog heading={t("user:builds.sorting.header")} onClose={close}>
			<fetcher.Form method="post">
				<input
					type="hidden"
					name="buildSorting"
					value={JSON.stringify(buildSorting.filter(Boolean))}
				/>
				<div className="stack lg">
					<div className="stack md">
						<FormMessage type="info">
							{t("user:builds.sorting.info")}
						</FormMessage>
						<SendouButton
							className="ml-auto"
							variant="minimal"
							size="small"
							onPress={() => setBuildSorting([...DEFAULT_BUILD_SORT, null])}
						>
							{t("user:builds.sorting.backToDefaults")}
						</SendouButton>
						{buildSorting.map((sort, i) => {
							const isLast = i === buildSorting.length - 1;
							const isSecondToLast = i === buildSorting.length - 2;

							if (isLast && canAddMoreSorting) {
								return (
									<ChangeSortingDialogSelect
										key={i}
										identifiers={BUILD_SORT_IDENTIFIERS.filter(
											(identifier) =>
												!buildSorting.slice(0, -1).includes(identifier),
										)}
										value={sort}
										changeValue={(newValue) => changeSorting(i, newValue)}
									/>
								);
							}

							return (
								<div
									key={i}
									className="stack horizontal justify-between items-center"
								>
									<div className="font-bold">
										{i + 1}) {t(`user:builds.sorting.${sort!}`)}
									</div>
									{(isLast && !canAddMoreSorting) ||
									(canAddMoreSorting && isSecondToLast) ? (
										<SendouButton
											size="small"
											icon={<Trash />}
											variant="minimal-destructive"
											onPress={deleteLastSorting}
										/>
									) : null}
								</div>
							);
						})}
					</div>

					<div>
						<SubmitButton _action="UPDATE_SORTING">
							{t("common:actions.save")}
						</SubmitButton>
					</div>
				</div>
			</fetcher.Form>
		</SendouDialog>
	);
}

function ChangeSortingDialogSelect({
	identifiers,
	value,
	changeValue,
}: {
	identifiers: BuildSort[];
	value: BuildSort | null;
	changeValue: (value: BuildSort | null) => void;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<select
			value={value ?? MISSING_SORT_VALUE}
			onChange={(e) => {
				if (e.target.value === MISSING_SORT_VALUE) changeValue(null);

				changeValue(e.target.value as BuildSort);
			}}
		>
			<option value={MISSING_SORT_VALUE}>-</option>
			{identifiers.map((identifier) => {
				return (
					<option key={identifier} value={identifier}>
						{t(`user:builds.sorting.${identifier}`)}
					</option>
				);
			})}
		</select>
	);
}

function WeaponFilterMenu({
	mainWeaponIds,
	counts,
	weaponFilter,
	setWeaponFilter,
}: {
	mainWeaponIds: MainWeaponId[];
	counts: UserBuildsPageData["weaponCounts"];
	weaponFilter: BuildFilter;
	setWeaponFilter: (weaponFilter: MainWeaponId) => void;
}) {
	const { t } = useTranslation(["weapons", "builds"]);

	return (
		<SendouMenu
			scrolling
			trigger={
				<SendouButton
					variant={typeof weaponFilter === "number" ? undefined : "outlined"}
					size="small"
					className={userStyles.buildFilterButton}
				>
					<Image
						path={weaponCategoryUrl("SHOOTERS")}
						width={24}
						height={24}
						alt=""
					/>
					{t("builds:filters.filterByWeapon")}
				</SendouButton>
			}
		>
			{mainWeaponIds.map((weaponId) => {
				const count = counts[weaponId];

				if (!count) return null;

				return (
					<SendouMenuItem
						key={weaponId}
						icon={
							<WeaponImage weaponSplId={weaponId} variant="build" size={18} />
						}
						onAction={() => setWeaponFilter(weaponId)}
						isActive={weaponFilter === weaponId}
					>
						{`${t(`weapons:MAIN_${weaponId}`)} (${count})`}
					</SendouMenuItem>
				);
			})}
		</SendouMenu>
	);
}

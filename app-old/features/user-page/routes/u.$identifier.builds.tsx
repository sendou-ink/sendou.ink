import { useFetcher, useLoaderData, useMatches } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { BuildCard } from "~/components/BuildCard";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { Image, WeaponImage } from "~/components/Image";
import { Menu, type MenuProps } from "~/components/Menu";
import { SubmitButton } from "~/components/SubmitButton";
import { LockIcon } from "~/components/icons/Lock";
import { SortIcon } from "~/components/icons/Sort";
import { TrashIcon } from "~/components/icons/Trash";
import { UnlockIcon } from "~/components/icons/Unlock";
import { BUILD_SORT_IDENTIFIERS, type BuildSort } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { mainWeaponIds } from "~/modules/in-game-lists";
import { atOrError } from "~/utils/arrays";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { weaponCategoryUrl } from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { DEFAULT_BUILD_SORT } from "../user-page-constants";
import type { UserPageLoaderData } from "./u.$identifier";

import { action } from "../actions/u.$identifier.builds.server";
import { loader } from "../loaders/u.$identifier.builds.server";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear"],
};

type BuildFilter = "ALL" | "PUBLIC" | "PRIVATE" | MainWeaponId;

export default function UserBuildsPage() {
	const { t } = useTranslation(["builds", "user"]);
	const user = useUser();
	const layoutData = atOrError(useMatches(), -2).data as UserPageLoaderData;
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
						icon={<SortIcon />}
						data-testid="change-sorting-button"
					>
						{t("user:builds.sorting.changeButton")}
					</SendouButton>
				</div>
			)}
			<BuildsFilters
				weaponFilter={weaponFilter}
				setWeaponFilter={setWeaponFilter}
			/>
			{builds.length > 0 ? (
				<div className="builds-container">
					{builds.map((build) => (
						<BuildCard
							key={build.id}
							build={build}
							canEdit={isOwnPage}
							withAbilitySorting={
								!isOwnPage && !user?.preferences.disableBuildAbilitySorting
							}
						/>
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
	const layoutData = atOrError(useMatches(), -2).data as UserPageLoaderData;

	if (data.builds.length === 0) return null;

	const privateBuildsCount = data.builds.filter(
		(build) => build.private,
	).length;
	const publicBuildsCount = data.builds.length - privateBuildsCount;

	const showPublicPrivateFilters =
		user?.id === layoutData.user.id && privateBuildsCount > 0;

	const WeaponFilterMenuButton = React.forwardRef((props, ref) => (
		<Button
			variant={typeof weaponFilter === "number" ? undefined : "outlined"}
			size="tiny"
			className="u__build-filter-button"
			{...props}
			_ref={ref}
		>
			<Image
				path={weaponCategoryUrl("SHOOTERS")}
				width={24}
				height={24}
				alt=""
			/>
			{t("builds:filters.filterByWeapon")}
		</Button>
	));

	const weaponFilterMenuItems = mainWeaponIds
		.map((weaponId) => {
			const count = data.weaponCounts[weaponId];

			if (!count) return null;

			const item: MenuProps["items"][number] = {
				id: weaponId,
				text: `${t(`weapons:MAIN_${weaponId}`)} (${count})`,
				icon: <WeaponImage weaponSplId={weaponId} variant="build" size={18} />,
				onClick: () => setWeaponFilter(weaponId),
				selected: weaponFilter === weaponId,
			};

			return item;
		})
		.filter((item) => item !== null);

	return (
		<div className="stack horizontal sm flex-wrap">
			<SendouButton
				onPress={() => setWeaponFilter("ALL")}
				variant={weaponFilter === "ALL" ? undefined : "outlined"}
				size="small"
				className="u__build-filter-button"
			>
				{t("builds:stats.all")} ({data.builds.length})
			</SendouButton>
			{showPublicPrivateFilters ? (
				<>
					<Button
						onClick={() => setWeaponFilter("PUBLIC")}
						variant={weaponFilter === "PUBLIC" ? undefined : "outlined"}
						size="tiny"
						className="u__build-filter-button"
						icon={<UnlockIcon />}
					>
						{t("builds:stats.public")} ({publicBuildsCount})
					</Button>
					<Button
						onClick={() => setWeaponFilter("PRIVATE")}
						variant={weaponFilter === "PRIVATE" ? undefined : "outlined"}
						size="tiny"
						className="u__build-filter-button"
						icon={<LockIcon />}
					>
						{t("builds:stats.private")} ({privateBuildsCount})
					</Button>
				</>
			) : null}

			<Menu
				items={weaponFilterMenuItems}
				button={WeaponFilterMenuButton}
				scrolling
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
		<Dialog isOpen close={close}>
			<fetcher.Form method="post">
				<input
					type="hidden"
					name="buildSorting"
					value={JSON.stringify(buildSorting.filter(Boolean))}
				/>
				<h2 className="text-lg">{t("user:builds.sorting.header")}</h2>
				<div className="stack lg">
					<div className="stack md">
						<FormMessage type="info">
							{t("user:builds.sorting.info")}
						</FormMessage>
						<Button
							className="ml-auto"
							variant="minimal"
							size="tiny"
							onClick={() => setBuildSorting([...DEFAULT_BUILD_SORT, null])}
						>
							{t("user:builds.sorting.backToDefaults")}
						</Button>
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
								<div key={i} className="stack horizontal justify-between">
									<div className="font-bold">
										{i + 1}) {t(`user:builds.sorting.${sort!}`)}
									</div>
									{(isLast && !canAddMoreSorting) ||
									(canAddMoreSorting && isSecondToLast) ? (
										<Button
											icon={<TrashIcon />}
											variant="minimal-destructive"
											onClick={deleteLastSorting}
										/>
									) : null}
								</div>
							);
						})}
					</div>

					<div className="stack sm horizontal justify-center">
						<SubmitButton _action="UPDATE_SORTING">
							{t("common:actions.save")}
						</SubmitButton>
						<Button variant="destructive" onClick={close}>
							{t("common:actions.cancel")}
						</Button>
					</div>
				</div>
			</fetcher.Form>
		</Dialog>
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

import type { MetaFunction } from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { useSearchParams } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { MapPoolSelector, MapPoolStages } from "~/components/MapPoolSelector";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import type { Tables } from "~/db/tables";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { MAPS_URL, ipLabsMaps, navIconUrl } from "~/utils/urls";
import { generateMapList } from "../core/map-list-generator/map-list";
import { modesOrder } from "../core/map-list-generator/modes";
import { mapPoolToNonEmptyModes } from "../core/map-list-generator/utils";
import { MapPool } from "../core/map-pool";

import styles from "./maps.module.css";

const AMOUNT_OF_MAPS_IN_MAP_LIST = stageIds.length * 2;

export const shouldRevalidate: ShouldRevalidateFunction = ({ nextUrl }) => {
	const searchParams = new URL(nextUrl).searchParams;
	// Only let loader reload data if we're not currently editing the map pool
	// and persisting it in the search params.
	return searchParams.has("readonly");
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Map List Generator",
		ogTitle: "Splatoon 3 map list generator",
		description:
			"Generate a map list based on maps you choose or a tournament's map pool.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "game-misc",
	breadcrumb: () => ({
		imgPath: navIconUrl("maps"),
		href: MAPS_URL,
		type: "IMAGE",
	}),
};

export default function MapListPage() {
	const { t } = useTranslation(["common"]);
	const { mapPool, handleMapPoolChange, readonly } =
		useSearchParamPersistedMapPool();

	return (
		<Main className={`${styles.container} stack lg`}>
			{readonly ? (
				<MapPoolStages mapPool={mapPool} />
			) : (
				<MapPoolSelector
					mapPool={mapPool}
					handleMapPoolChange={handleMapPoolChange}
					allowBulkEdit
					className={styles.poolSelector}
				/>
			)}
			<a
				href={ipLabsMaps(mapPool.serialized)}
				target="_blank"
				rel="noreferrer"
				className={styles.tournamentMapListLink}
			>
				{t("common:maps.tournamentMaplist")}
			</a>
			<MapListCreator mapPool={mapPool} />
		</Main>
	);
}

export function useSearchParamPersistedMapPool() {
	const [searchParams, setSearchParams] = useSearchParams();

	const [mapPool, setMapPool] = React.useState(() => {
		if (searchParams.has("pool")) {
			return new MapPool(searchParams.get("pool")!);
		}

		return MapPool.ANARCHY;
	});

	const handleMapPoolChange = (
		newMapPool: MapPool,
		event?: Pick<Tables["CalendarEvent"], "id" | "name">,
	) => {
		setMapPool(newMapPool);
		setSearchParams(
			event
				? { eventId: event.id.toString() }
				: {
						pool: newMapPool.serialized,
					},
			{ replace: true, preventScrollReset: true },
		);
	};

	return {
		mapPool,
		readonly: searchParams.has("readonly"),
		handleMapPoolChange,
	};
}

function MapListCreator({ mapPool }: { mapPool: MapPool }) {
	const { t } = useTranslation(["game-misc", "common"]);
	const [mapList, setMapList] = React.useState<ModeWithStage[]>();
	const [szEveryOther, setSzEveryOther] = React.useState(false);
	const [, copyToClipboard] = useCopyToClipboard();

	const handleCreateMaplist = () => {
		const [list] = generateMapList(
			mapPool,
			modesOrder(
				szEveryOther ? "SZ_EVERY_OTHER" : "EQUAL",
				mapPoolToNonEmptyModes(mapPool),
			),
			[AMOUNT_OF_MAPS_IN_MAP_LIST],
		);

		invariant(list);

		setMapList(list);
	};

	const disabled =
		mapPool.isEmpty() || (szEveryOther && !mapPool.hasMode("SZ"));

	return (
		<div className={styles.mapListCreator}>
			<div className={styles.toggleContainer}>
				<Label>{t("common:maps.halfSz")}</Label>
				<SendouSwitch
					isSelected={szEveryOther}
					onChange={setSzEveryOther}
					size="small"
				/>
			</div>
			<SendouButton onPress={handleCreateMaplist} isDisabled={disabled}>
				{t("common:maps.createMapList")}
			</SendouButton>
			{mapList && (
				<>
					<ol className={styles.mapList}>
						{mapList.map(({ mode, stageId }, i) => (
							<li key={i}>
								<abbr
									className={styles.modeAbbr}
									title={t(`game-misc:MODE_LONG_${mode}`)}
								>
									{t(`game-misc:MODE_SHORT_${mode}`)}
								</abbr>{" "}
								{t(`game-misc:STAGE_${stageId}`)}
							</li>
						))}
					</ol>
					<SendouButton
						size="small"
						variant="outlined"
						onPress={() =>
							copyToClipboard(
								mapList
									.map(
										({ mode, stageId }, i) =>
											`${i + 1}) ${t(`game-misc:MODE_SHORT_${mode}`)} ${t(
												`game-misc:STAGE_${stageId}`,
											)}`,
									)
									.join("\n"),
							)
						}
					>
						{t("common:actions.copyToClipboard")}
					</SendouButton>
				</>
			)}
		</div>
	);
}

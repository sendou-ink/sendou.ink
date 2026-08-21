import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { Main } from "~/components/Main";
import { Pagination } from "~/components/Pagination";
import { WeaponSelect } from "~/components/WeaponSelect";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, VODS_PAGE } from "~/utils/urls";
import { VodListing, VodListingList } from "../components/VodListing";
import { loader } from "../loaders/vods.server";
import { videoMatchTypes } from "../vods-constants";
import { vodsSearchParams } from "../vods-search-params";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
	breadcrumb: () => ({
		imgPath: navIconUrl("vods"),
		href: VODS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction<typeof loader> = (args) => {
	return metaTags({
		title: "VODs",
		ogTitle: "Splatoon 3 VODs (gameplay footage search)",
		description:
			"Search for Splatoon 3 VODs (gameplay footage) by mode, stage and/or weapon.",
		location: args.location,
	});
};

export default function VodsSearchPage() {
	const { t } = useTranslation(["vods"]);
	const data = useLoaderData<typeof loader>();

	const pagination = useSearchParamPagination({
		definition: vodsSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
	});

	return (
		<Main className="stack lg" bigger>
			<Filters />
			{data.vods.length > 0 ? (
				<>
					<VodListingList>
						{data.vods.map((vod) => (
							<VodListing key={vod.id} vod={vod} />
						))}
					</VodListingList>
					{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
				</>
			) : (
				<div className="text-lg text-lighter">{t("vods:noVods")}</div>
			)}
		</Main>
	);
}

function Filters() {
	const { t } = useTranslation(["game-misc", "vods", "weapons"]);

	const [{ mode, stageId, weapon, type }, setParams] =
		useSearchParamsTyped(vodsSearchParams);

	return (
		<FilterBar
			pills={[
				{
					key: "mode",
					name: t("vods:forms.title.mode"),
					formattedValue:
						mode !== null ? t(`game-misc:MODE_SHORT_${mode}`) : null,
					onRemove: () => setParams({ mode: null }),
					testId: "vods-mode-filter",
					popover: (
						<SendouChipRadioGroup wrap>
							{modesShort.map((option) => (
								<SendouChipRadio
									key={option}
									name="vods-mode"
									value={option}
									checked={mode === option}
									onChange={(value) => setParams({ mode: value as ModeShort })}
								>
									{t(`game-misc:MODE_SHORT_${option}`)}
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					),
				},
				{
					key: "stage",
					name: t("vods:forms.title.stage"),
					formattedValue:
						stageId !== null ? t(`game-misc:STAGE_${stageId}`) : null,
					onRemove: () => setParams({ stageId: null }),
					testId: "vods-stage-filter",
					popover: (
						<SendouSelect
							aria-label={t("vods:forms.title.stage")}
							items={stageIds.map((id) => ({ id }))}
							selectedKey={stageId}
							onSelectionChange={(key) =>
								setParams({ stageId: key as StageId })
							}
							search={{}}
						>
							{({ id }) => (
								<SendouSelectItem key={id} id={id}>
									{t(`game-misc:STAGE_${id}`)}
								</SendouSelectItem>
							)}
						</SendouSelect>
					),
				},
				{
					key: "weapon",
					name: t("vods:forms.title.weapon"),
					formattedValue: weapon !== null ? t(`weapons:MAIN_${weapon}`) : null,
					onRemove: () => setParams({ weapon: null }),
					testId: "vods-weapon-filter",
					popover: (
						<WeaponSelect
							value={weapon}
							onChange={(weaponId) => {
								setParams({ weapon: weaponId ?? null });
							}}
							clearable
						/>
					),
				},
				{
					key: "type",
					name: t("vods:forms.title.type"),
					formattedValue: type !== null ? t(`vods:type.${type}`) : null,
					onRemove: () => setParams({ type: null }),
					testId: "vods-type-filter",
					popover: (
						<SendouChipRadioGroup wrap>
							{videoMatchTypes.map((option) => (
								<SendouChipRadio
									key={option}
									name="vods-type"
									value={option}
									checked={type === option}
									onChange={(value) =>
										setParams({
											type: value as (typeof videoMatchTypes)[number],
										})
									}
								>
									{t(`vods:type.${option}`)}
								</SendouChipRadio>
							))}
						</SendouChipRadioGroup>
					),
				},
			]}
		/>
	);
}

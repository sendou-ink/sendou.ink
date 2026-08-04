import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Label } from "~/components/Label";
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
import { VodListing } from "../components/VodListing";
import { loader } from "../loaders/vods.server";
import { videoMatchTypes } from "../vods-constants";
import { vodsSearchParams } from "../vods-search-params";
import styles from "./vods.module.css";

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
					<div className={styles.listingList}>
						{data.vods.map((vod) => (
							<VodListing key={vod.id} vod={vod} />
						))}
					</div>
					{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
				</>
			) : (
				<div className="text-lg text-lighter">{t("vods:noVods")}</div>
			)}
		</Main>
	);
}

function Filters() {
	const { t } = useTranslation(["game-misc", "vods"]);

	const [{ mode, stageId, weapon, type }, setParams] =
		useSearchParamsTyped(vodsSearchParams);

	return (
		<div className="stack sm horizontal flex-wrap">
			<div>
				<Label>{t("vods:forms.title.mode")}</Label>
				<select
					name="mode"
					value={mode ?? ""}
					onChange={(e) =>
						setParams({ mode: (e.target.value || null) as ModeShort | null })
					}
				>
					<option value="">-</option>
					{modesShort.map((mode) => {
						return (
							<option key={mode} value={mode}>
								{t(`game-misc:MODE_SHORT_${mode}`)}
							</option>
						);
					})}
				</select>
			</div>
			<div>
				<Label>{t("vods:forms.title.stage")}</Label>
				<select
					name="stage"
					value={stageId ?? ""}
					onChange={(e) =>
						setParams({
							stageId:
								e.target.value === ""
									? null
									: (Number(e.target.value) as StageId),
						})
					}
				>
					<option value="">-</option>
					{stageIds.map((stageId) => {
						return (
							<option key={stageId} value={stageId}>
								{t(`game-misc:STAGE_${stageId}`)}
							</option>
						);
					})}
				</select>
			</div>

			<WeaponSelect
				label={t("vods:forms.title.weapon")}
				value={weapon}
				onChange={(weaponId) => {
					setParams({ weapon: weaponId ?? null });
				}}
				clearable
			/>

			<div>
				<Label>{t("vods:forms.title.type")}</Label>
				<select
					name="type"
					className={styles.typeSelect}
					value={type ?? ""}
					onChange={(e) =>
						setParams({
							type: (e.target.value || null) as
								| (typeof videoMatchTypes)[number]
								| null,
						})
					}
				>
					<option value="">-</option>
					{videoMatchTypes.map((type) => {
						return (
							<option key={type} value={type}>
								{t(`vods:type.${type}`)}
							</option>
						);
					})}
				</select>
			</div>
		</div>
	);
}

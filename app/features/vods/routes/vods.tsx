import type { MetaFunction } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { AddNewButton } from "~/components/AddNewButton";
import { SendouButton } from "~/components/elements/Button";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, newVodPage, VODS_PAGE } from "~/utils/urls";
import { VodListing } from "../components/VodListing";
import { loader } from "../loaders/vods.server";
import { VODS_PAGE_BATCH_SIZE, videoMatchTypes } from "../vods-constants";
export { loader };

import "../vods.css";

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
	const { t } = useTranslation(["vods", "common"]);
	const data = useLoaderData<typeof loader>();
	const [, setSearchParams] = useSearchParams();

	const addToSearchParams = (key: string, value: string | number) => {
		setSearchParams((params) => ({
			...Object.fromEntries(params.entries()),
			[key]: String(value),
		}));
	};

	return (
		<Main className="stack lg" bigger>
			<div className="stack sm horizontal justify-between items-start">
				<Filters addToSearchParams={addToSearchParams} />
				<AddNewButton navIcon="vods" to={newVodPage()} />
			</div>
			{data.vods.length > 0 ? (
				<>
					<div className="vods__listing__list">
						{data.vods.map((vod) => (
							<VodListing key={vod.id} vod={vod} />
						))}
					</div>
					{data.hasMoreVods && (
						<SendouButton
							className="m-0-auto"
							size="small"
							onPress={() =>
								addToSearchParams("limit", data.limit + VODS_PAGE_BATCH_SIZE)
							}
						>
							{t("common:actions.loadMore")}
						</SendouButton>
					)}
				</>
			) : (
				<div className="text-lg text-lighter">{t("vods:noVods")}</div>
			)}
		</Main>
	);
}

function Filters({
	addToSearchParams,
}: {
	addToSearchParams: (key: string, value: string | number) => void;
}) {
	const { t } = useTranslation(["game-misc", "vods"]);

	const [searchParams] = useSearchParams();
	const mode = modesShort.find(
		(mode) => searchParams.get("mode") && mode === searchParams.get("mode"),
	);
	const stageId = stageIds.find(
		(stageId) =>
			searchParams.get("stageId") &&
			stageId === Number(searchParams.get("stageId")),
	);
	const weapon = mainWeaponIds.find(
		(id) =>
			searchParams.get("weapon") && id === Number(searchParams.get("weapon")),
	);
	const type = videoMatchTypes.find(
		(type) => searchParams.get("type") && type === searchParams.get("type"),
	);

	return (
		<div className="stack sm horizontal flex-wrap">
			<div>
				<Label>{t("vods:forms.title.mode")}</Label>
				<select
					name="mode"
					value={mode ?? ""}
					onChange={(e) => addToSearchParams("mode", e.target.value)}
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
					onChange={(e) => addToSearchParams("stageId", e.target.value)}
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
				value={weapon ?? null}
				onChange={(weaponId) => {
					addToSearchParams("weapon", weaponId ?? "");
				}}
				clearable
			/>

			<div>
				<Label>{t("vods:forms.title.type")}</Label>
				<select
					name="type"
					className="vods__type-select"
					value={type ?? ""}
					onChange={(e) => addToSearchParams("type", e.target.value)}
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

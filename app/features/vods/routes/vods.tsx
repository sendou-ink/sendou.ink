import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { i18next } from "~/modules/i18n/i18next.server";
import { mainWeaponIds, modesShort, stageIds } from "~/modules/in-game-lists";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import { VODS_PAGE, navIconUrl } from "~/utils/urls";
import { VodListing } from "../components/VodListing";
import { findVods } from "../queries/findVods.server";
import { VODS_PAGE_BATCH_SIZE, videoMatchTypes } from "../vods-constants";

import "../vods.css";

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
	breadcrumb: () => ({
		imgPath: navIconUrl("vods"),
		href: VODS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [{ title: data.title }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request);
	const url = new URL(request.url);

	const limit = Number(url.searchParams.get("limit") ?? VODS_PAGE_BATCH_SIZE);

	const vods = findVods({
		...Object.fromEntries(
			Array.from(url.searchParams.entries()).filter(([, value]) => value),
		),
		limit: limit + 1,
	});

	let hasMoreVods = false;
	if (vods.length > limit) {
		vods.pop();
		hasMoreVods = true;
	}

	return {
		vods,
		title: makeTitle(t("pages.vods")),
		limit,
		hasMoreVods,
	};
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
			<Filters addToSearchParams={addToSearchParams} />
			{data.vods.length > 0 ? (
				<>
					<div className="vods__listing__list">
						{data.vods.map((vod) => (
							<VodListing key={vod.id} vod={vod} />
						))}
					</div>
					{data.hasMoreVods && (
						<Button
							className="m-0-auto"
							size="tiny"
							onClick={() =>
								addToSearchParams("limit", data.limit + VODS_PAGE_BATCH_SIZE)
							}
						>
							{t("common:actions.loadMore")}
						</Button>
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

			<div>
				<Label>{t("vods:forms.title.weapon")}</Label>
				<WeaponCombobox
					inputName="weapon"
					initialWeaponId={weapon}
					onChange={(selected) => {
						addToSearchParams("weapon", selected?.value ?? "");
					}}
					nullable
				/>
			</div>

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

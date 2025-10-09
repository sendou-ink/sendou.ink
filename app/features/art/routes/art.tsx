import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AddNewButton } from "~/components/AddNewButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { CrossIcon } from "~/components/icons/Cross";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { artPage, navIconUrl, newArtPage } from "~/utils/urls";
import { metaTags } from "../../../utils/remix";
import { FILTERED_TAG_KEY_SEARCH_PARAM_KEY } from "../art-constants";
import { ArtGrid } from "../components/ArtGrid";
import { TagSelect } from "../components/TagSelect";
import { loader } from "../loaders/art.server";
export { loader };

const OPEN_COMMISIONS_KEY = "open";
const TAB_KEY = "tab";

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	const currentFilteredTag = args.currentUrl.searchParams.get(
		FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
	);
	const nextFilteredTag = args.nextUrl.searchParams.get(
		FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
	);

	if (currentFilteredTag === nextFilteredTag) return false;

	return args.defaultShouldRevalidate;
};

export const handle: SendouRouteHandle = {
	i18n: ["art"],
	breadcrumb: () => ({
		imgPath: navIconUrl("art"),
		href: artPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return metaTags({
		title: "Art",
		ogTitle: "Splatoon art showcase",
		description:
			"Splatoon art filterable by various tags. Find artist to commission for your own custom art. Includes various styles such as traditional, digital, 3D and SFM.",
		location: args.location,
	});
};

export default function ArtPage() {
	const { t } = useTranslation(["art", "common"]);
	const data = useLoaderData<typeof loader>();
	const [searchParams, setSearchParams] = useSearchParams();
	const switchId = React.useId();

	const selectedTab = searchParams.get(TAB_KEY) ?? "recently-uploaded";
	const filteredTag = searchParams.get(FILTERED_TAG_KEY_SEARCH_PARAM_KEY);
	const showOpenCommissions = searchParams.get(OPEN_COMMISIONS_KEY) === "true";

	const showcaseArts = !showOpenCommissions
		? data.showcaseArts
		: data.showcaseArts.filter((art) => art.author?.commissionsOpen);

	const recentlyUploadedArts = !showOpenCommissions
		? data.recentlyUploadedArts
		: data.recentlyUploadedArts.filter((art) => art.author?.commissionsOpen);

	return (
		<Main className="stack lg">
			<div className="stack horizontal md justify-between items-center flex-wrap">
				<div className="stack horizontal sm text-sm font-semi-bold">
					<SendouSwitch
						isSelected={showOpenCommissions}
						onChange={() =>
							setSearchParams((prev) => {
								prev.set(OPEN_COMMISIONS_KEY, String(!showOpenCommissions));
								return prev;
							})
						}
						id={switchId}
					/>
					<Label htmlFor={switchId} className="m-auto-0">
						{t("art:openCommissionsOnly")}
					</Label>
				</div>
				<div className="stack horizontal sm items-center">
					<div
						className={clsx({
							invisible: selectedTab !== "showcase",
						})}
					>
						<TagSelect
							key={filteredTag}
							tags={data.allTags}
							onSelectionChange={(tagName) => {
								setSearchParams((prev) => {
									prev.set(
										FILTERED_TAG_KEY_SEARCH_PARAM_KEY,
										tagName as string,
									);
									return prev;
								});
							}}
						/>
					</div>
					<AddNewButton navIcon="art" to={newArtPage()} />
				</div>
			</div>
			{filteredTag ? (
				<div className="text-xs text-lighter stack md horizontal items-center">
					{t("art:filteringByTag", { tag: filteredTag })}
					<SendouButton
						size="small"
						variant="minimal-destructive"
						icon={<CrossIcon />}
						onPress={() => {
							setSearchParams((prev) => {
								prev.delete(FILTERED_TAG_KEY_SEARCH_PARAM_KEY);
								return prev;
							});
						}}
						data-testid="clear-filter-button"
					>
						{t("common:actions.clear")}
					</SendouButton>
				</div>
			) : null}
			<SendouTabs
				selectedKey={selectedTab}
				onSelectionChange={(key) => {
					setSearchParams((prev) => {
						prev.set(TAB_KEY, key as string);
						if (key === "recently-uploaded") {
							prev.delete(FILTERED_TAG_KEY_SEARCH_PARAM_KEY);
						}
						return prev;
					});
				}}
			>
				<SendouTabList>
					<SendouTab id="recently-uploaded">
						{t("art:tabs.recentlyUploaded")}
					</SendouTab>
					<SendouTab id="showcase">{t("art:tabs.showcase")}</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="recently-uploaded">
					<ArtGrid arts={recentlyUploadedArts} showUploadDate />
				</SendouTabPanel>
				<SendouTabPanel id="showcase">
					<ArtGrid arts={showcaseArts} />
				</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

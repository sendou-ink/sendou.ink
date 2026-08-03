import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { artPage, navIconUrl } from "~/utils/urls";
import { metaTags, type SerializeFrom } from "../../../utils/remix";
import { ART_TABS, artSearchParams } from "../art-search-params";
import { ArtGrid } from "../components/ArtGrid";
import { TagSelect } from "../components/TagSelect";
import { loader } from "../loaders/art.server";

export { loader };

export const shouldRevalidate = artSearchParams.shouldRevalidate;

export const handle: SendouRouteHandle = {
	i18n: ["art"],
	breadcrumb: () => ({
		imgPath: navIconUrl("art"),
		href: artPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

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
	const { t } = useTranslation(["art", "common", "forms"]);
	const data = useLoaderData<typeof loader>();
	const [
		{ tab: selectedTab, tag: filteredTag, open: showOpenCommissions },
		setParams,
	] = useSearchParamsTyped(artSearchParams);
	const switchId = React.useId();

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
						onChange={() => setParams({ open: !showOpenCommissions })}
						id={switchId}
					/>
					<Label htmlFor={switchId} className="m-auto-0">
						{t("forms:labels.profileCommissionsOpen")}
					</Label>
				</div>
				<div
					className={clsx({
						invisible: selectedTab !== ART_TABS.SHOWCASE,
					})}
				>
					<TagSelect
						key={filteredTag}
						tags={data.allTags}
						onSelectionChange={(tagName) => {
							setParams({ tag: tagName as string });
						}}
					/>
				</div>
			</div>
			{filteredTag ? (
				<div className="text-xs text-lighter stack md horizontal items-center">
					{t("art:filteringByTag", { tag: filteredTag })}
					<SendouButton
						size="small"
						variant="minimal-destructive"
						icon={<X />}
						onPress={() => {
							setParams({ tag: null });
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
					const tab = key as (typeof ART_TABS)[keyof typeof ART_TABS];
					setParams(
						tab === ART_TABS.RECENTLY_UPLOADED ? { tab, tag: null } : { tab },
					);
				}}
			>
				<SendouTabList>
					<SendouTab id={ART_TABS.RECENTLY_UPLOADED}>
						{t("art:tabs.recentlyUploaded")}
					</SendouTab>
					<SendouTab id={ART_TABS.SHOWCASE}>{t("art:tabs.showcase")}</SendouTab>
				</SendouTabList>
				<SendouTabPanel id={ART_TABS.RECENTLY_UPLOADED}>
					<ArtGrid arts={recentlyUploadedArts} showUploadDate />
				</SendouTabPanel>
				<SendouTabPanel id={ART_TABS.SHOWCASE}>
					{filteredTag && showcaseArts.length === 0 ? (
						<div className="no-results mt-4">
							{t("art:noArtForTag", { tag: filteredTag })}
						</div>
					) : (
						<ArtGrid arts={showcaseArts} />
					)}
				</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

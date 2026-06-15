import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Main } from "~/components/Main";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { outlinedMainWeaponImageUrl } from "~/utils/urls";
import { WeaponKits } from "../components/WeaponKits";
import { WeaponParamsTable } from "../components/WeaponParamsTable";
import { WeaponPatchHistory } from "../components/WeaponPatchHistory";
import { loader } from "../loaders/params.$slug.server";

export { loader };

import styles from "./params.$slug.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "common", "analyzer"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;
		if (!data) return [];
		return [
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: `/params/${data.slug}`,
				type: "IMAGE",
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];
	return metaTags({
		title: args.data.weaponName,
		description: `${args.data.weaponName} parameters with version history compared across the weapon's category.`,
		location: args.location,
	});
};

// xxx: allow toggling row by clicking anywhere
// xxx: see how Arrays of objects (like DistanceDamage) can be supported

export default function WeaponParamsPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "weapons"]);

	const [tab, setTab] = useSearchParamState({
		name: "tab",
		defaultValue: "params",
		revive: (value) => (value === "patches" ? "patches" : "params"),
	});

	return (
		<Main className={styles.container} bigger>
			<WeaponKits kits={data.kits} />
			<SendouTabs
				selectedKey={tab}
				onSelectionChange={(key) => setTab(String(key))}
				className={styles.tabs}
			>
				<SendouTabList>
					<SendouTab id="params">
						{t("common:weaponParams.tab.params")}
					</SendouTab>
					<SendouTab id="patches" number={data.patchHistory.length}>
						{t("common:weaponParams.tab.patches")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="params">
					<WeaponParamsTable
						currentWeaponId={data.weaponId}
						categoryWeaponIds={data.categoryWeaponIds}
						weaponParams={data.weaponParams}
						specialPoints={data.specialPoints}
						versions={data.versions}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="patches">
					<WeaponPatchHistory patches={data.patchHistory} />
				</SendouTabPanel>
			</SendouTabs>
			<a
				href="https://leanny.github.io/"
				target="_blank"
				rel="noopener noreferrer"
				className={styles.dataCredit}
			>
				{t("common:dataCredit.lean")}
			</a>
		</Main>
	);
}

import { ChartColumnBig, Flame, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { WeaponImage } from "~/components/Image";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { Main } from "~/components/Main";
import type { SerializeFrom } from "~/utils/remix";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	outlinedMainWeaponImageUrl,
	VODS_PAGE,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
} from "~/utils/urls";
import { WeaponParamsTable } from "../components/WeaponParamsTable";
import { loader } from "../loaders/weapons.$slug.server";

export { loader };

import styles from "./weapons.$slug.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "common"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;
		if (!data) return [];
		return [
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: `/weapons/${data.slug}`,
				type: "IMAGE",
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];
	return metaTags({
		title: args.data.weaponName,
		description: `${args.data.weaponName} page with links to builds, popular builds, stats, and VODs.`,
		location: args.location,
	});
};

export default function WeaponPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "weapons"]);

	return (
		<Main className={styles.container} bigger>
			<WeaponImage weaponSplId={data.weaponId} variant="build" size={128} />
			<h1 className={styles.weaponName}>{data.weaponName}</h1>
			<div className={styles.links}>
				<LinkButton
					to={weaponBuildPage(data.slug)}
					variant="outlined"
					icon={<FlaskConical />}
				>
					{t("common:pages.builds")}
				</LinkButton>
				<LinkButton
					to={weaponBuildPopularPage(data.slug)}
					variant="outlined"
					icon={<Flame />}
				>
					{t("common:pages.popularBuilds")}
				</LinkButton>
				<LinkButton
					to={weaponBuildStatsPage(data.slug)}
					variant="outlined"
					icon={<ChartColumnBig />}
				>
					{t("common:pages.abilityStats")}
				</LinkButton>
				<LinkButton
					to={`${VODS_PAGE}?weapon=${data.weaponId}`}
					variant="outlined"
					icon={<YouTubeIcon />}
				>
					{t("common:pages.vods")}
				</LinkButton>
			</div>
			<WeaponParamsTable
				currentWeaponId={data.weaponId}
				categoryWeaponIds={data.categoryWeaponIds}
				weaponParams={data.weaponParams}
				versions={data.versions}
			/>
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

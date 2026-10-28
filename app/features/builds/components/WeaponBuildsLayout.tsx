import clsx from "clsx";
import { ChartColumnBig, Flame, LayoutGrid } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { BackLink } from "~/components/BackLink";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Image, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { PageHeader } from "~/components/PageHeader";
import type { WeaponLandingState } from "~/components/WeaponLanding";
import { weaponLandingSearchParams } from "~/components/weapon-landing-search-params";
import { buildStatsSearchParams } from "~/features/build-stats/build-stats-search-params";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponIdToCategory } from "~/modules/in-game-lists/weapon-ids";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import {
	BUILDS_PAGE,
	navIconUrl,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
} from "~/utils/urls";
import styles from "./WeaponBuildsLayout.module.css";

/** Page layout of a weapon's build pages, same width on every tab, with tabs between its builds, ability stats and popular builds. */
export function WeaponBuildsLayout({
	weaponId,
	weaponName,
	slug,
	buildsCount,
	selectedTab,
	children,
}: {
	weaponId: MainWeaponId;
	weaponName: string;
	slug: string;
	buildsCount: number;
	selectedTab: "builds" | "stats" | "popular";
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common", "builds"]);
	// the stats tabs share their date filter, so switching between them keeps it
	const [{ date }] = useSearchParamsTyped(buildStatsSearchParams);

	return (
		<Main className={clsx("stack md", styles.main)}>
			<PageHeader
				image={
					<CircleBackdrop>
						<WeaponImage weaponSplId={weaponId} variant="build" size={36} />
					</CircleBackdrop>
				}
				title={weaponName}
				subtitle={
					<>
						<Image path={navIconUrl("builds")} size={16} alt="" />
						{t("common:pages.builds")}
					</>
				}
				back={
					<BackLink
						to={weaponLandingSearchParams.href(BUILDS_PAGE, {
							category: weaponIdToCategory(weaponId),
						})}
						state={{ focusSearch: true } satisfies WeaponLandingState}
					/>
				}
			/>
			<SendouTabs selectedKey={selectedTab}>
				<SendouTabList>
					<SendouTab
						id="builds"
						href={weaponBuildPage(slug)}
						icon={<LayoutGrid />}
						number={buildsCount}
					>
						{t("builds:linkButton.allBuilds")}
					</SendouTab>
					<SendouTab
						id="stats"
						href={buildStatsSearchParams.href(weaponBuildStatsPage(slug), {
							date,
						})}
						icon={<ChartColumnBig />}
					>
						{t("builds:linkButton.abilityStats")}
					</SendouTab>
					<SendouTab
						id="popular"
						href={buildStatsSearchParams.href(weaponBuildPopularPage(slug), {
							date,
						})}
						icon={<Flame />}
					>
						{t("builds:linkButton.popularBuilds")}
					</SendouTab>
				</SendouTabList>
				<SendouTabPanel id={selectedTab}>{children}</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

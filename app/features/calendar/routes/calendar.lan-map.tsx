import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { BackLink } from "~/components/BackLink";
import { EmptyState } from "~/components/EmptyState";
import { Main } from "~/components/Main";
import { PageHeader } from "~/components/PageHeader";
import { useHydrated } from "~/hooks/useHydrated";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, LAN_MAP_PAGE, navIconUrl } from "~/utils/urls";
import { loader } from "../loaders/calendar.lan-map.server";
import styles from "./calendar.lan-map.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "LAN map",
		ogTitle: "Splatoon LAN events near you",
		image: ogPageImage("calendar"),
		location: args.location,
		description:
			"Map of upcoming in-person Splatoon tournaments and events around the world.",
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar"],
	breadcrumb: () => [
		{
			imgPath: navIconUrl("calendar"),
			href: CALENDAR_PAGE,
			type: "IMAGE",
		},
		{
			text: "LAN map",
			href: LAN_MAP_PAGE,
			type: "TEXT",
		},
	],
};

const LanMap = lazy(() =>
	import("../components/LanMap").then((module) => ({
		default: module.LanMap,
	})),
);

export default function LanMapPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<typeof loader>();
	const isHydrated = useHydrated();

	return (
		<Main bigger className="stack md">
			<PageHeader
				title={t("calendar:lanMap.title")}
				back={<BackLink to={CALENDAR_PAGE} />}
			/>
			{data.lans.length === 0 ? (
				<EmptyState navItem="calendar">
					{t("calendar:lanMap.noLans")}
				</EmptyState>
			) : isHydrated ? (
				<Suspense fallback={<div className={styles.placeholder} />}>
					<LanMap lans={data.lans} />
				</Suspense>
			) : (
				<div className={styles.placeholder} />
			)}
		</Main>
	);
}

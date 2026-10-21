import { CalendarClock, History, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { EmptyState } from "~/components/EmptyState";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Main } from "~/components/Main";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, navIconUrl } from "~/utils/urls";
import { LobbyCard } from "../components/LobbyCard";
import { loader } from "../loaders/lobbies.server";
import type { LobbyIndexTab } from "../lobbies-constants";
import { lobbiesSearchParams } from "../lobbies-search-params";
import styles from "./lobbies.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Lobbies",
		description:
			"Play 8s: sign up, check in and play best-ofs with teams reshuffled after every set.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["lobbies"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lobbies"),
		href: lobbiesPage(),
		type: "IMAGE",
	}),
};

export default function LobbiesPage() {
	const { t } = useTranslation(["lobbies"]);
	const data = useLoaderData<typeof loader>();
	const [tabFromUrl, setTab] = useSearchParam(lobbiesSearchParams, "tab");

	const tabs = [
		{
			id: "running",
			icon: <Play />,
			lobbies: data.running,
			empty: t("lobbies:index.empty.running"),
		},
		{
			id: "upcoming",
			icon: <CalendarClock />,
			lobbies: data.upcoming,
			empty: t("lobbies:index.empty.upcoming"),
		},
		{
			id: "ended",
			icon: <History />,
			lobbies: data.ended,
			empty: t("lobbies:index.empty.ended"),
		},
	] as const;

	const selectedTab =
		tabFromUrl ??
		(
			tabs.find(
				(candidate) =>
					candidate.id !== "ended" &&
					candidate.lobbies.some((lobby) => lobby.viewerStatus),
			) ?? tabs.find((candidate) => candidate.lobbies.length > 0)
		)?.id ??
		"running";

	return (
		<Main>
			<SendouTabs
				selectedKey={selectedTab}
				onSelectionChange={(key) => setTab(key as LobbyIndexTab)}
			>
				<SendouTabList sticky>
					{tabs.map((tab) => (
						<SendouTab
							key={tab.id}
							id={tab.id}
							icon={tab.icon}
							number={tab.lobbies.length}
							data-testid={`lobbies-${tab.id}-tab`}
						>
							{t(`lobbies:index.${tab.id}`)}
						</SendouTab>
					))}
				</SendouTabList>
				{tabs.map((tab) => (
					<SendouTabPanel key={tab.id} id={tab.id}>
						{tab.lobbies.length > 0 ? (
							<div className={styles.cards}>
								{tab.lobbies.map((lobby) => (
									<LobbyCard key={lobby.id} lobby={lobby} />
								))}
							</div>
						) : (
							<EmptyState navItem="lobbies">{tab.empty}</EmptyState>
						)}
					</SendouTabPanel>
				))}
			</SendouTabs>
		</Main>
	);
}

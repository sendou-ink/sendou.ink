import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import {
	Outlet,
	type ShouldRevalidateFunction,
	useLoaderData,
	useOutletContext,
} from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { useUser } from "~/features/auth/core/user";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { removeMarkdown } from "~/utils/strings";
import { assertUnreachable } from "~/utils/types";
import {
	tournamentDivisionsPage,
	tournamentOrganizationPage,
	tournamentPage,
	tournamentRegisterPage,
	userSubmittedImage,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import { type TournamentLoaderData, loader } from "../loaders/to.$id.server";
export { loader };

import "~/styles/calendar-event.css";
import "~/styles/maps.css";
import "../tournament.css";

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	const navigatedToMatchPage =
		typeof args.nextParams.mid === "string" && args.formMethod !== "POST";

	if (navigatedToMatchPage) return false;

	return args.defaultShouldRevalidate;
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader>;

	if (!data) return [];

	return metaTags({
		title: data.tournament.ctx.name,
		description: data.tournament.ctx.description
			? removeMarkdown(data.tournament.ctx.description)
			: undefined,
		image: {
			url: data.tournament.ctx.logoSrc,
			dimensions: { width: 124, height: 124 },
		},
		location: args.location,
		url: tournamentPage(data.tournament.ctx.id),
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["tournament", "calendar"],
	breadcrumb: ({ match }) => {
		const data = match.data as TournamentLoaderData | undefined;

		if (!data) return [];

		return [
			data.tournament.ctx.organization?.avatarUrl
				? {
						imgPath: userSubmittedImage(
							data.tournament.ctx.organization.avatarUrl,
						),
						href: tournamentOrganizationPage({
							organizationSlug: data.tournament.ctx.organization.slug,
						}),
						type: "IMAGE" as const,
						text: "",
						rounded: true,
					}
				: null,
			{
				imgPath: data.tournament.ctx.logoSrc,
				href: tournamentPage(data.tournament.ctx.id),
				type: "IMAGE" as const,
				text: data.tournament.ctx.name,
				rounded: true,
			},
		].filter((crumb) => crumb !== null);
	},
};

const TournamentContext = React.createContext<Tournament>(null!);

export default function TournamentLayoutShell() {
	const isMounted = useIsMounted();

	// tournaments are something that people like to refresh a lot
	// which can cause spikes that are hard for the server to handle
	// this is just making sure the SSR for this page is as fast as possible in prod
	if (!isMounted)
		return (
			<Main bigger>
				<div className="tournament__placeholder" />
			</Main>
		);

	return <TournamentLayout />;
}

export function TournamentLayout() {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const tournament = React.useMemo(
		() => new Tournament(data.tournament),
		[data],
	);
	const [bracketExpanded, setBracketExpanded] = React.useState(true);

	// this is nice to debug with tournament in browser console
	if (process.env.NODE_ENV === "development") {
		React.useEffect(() => {
			// @ts-expect-error for dev purposes
			window.tourney = tournament;
		}, [tournament]);
	}

	const subsCount = () =>
		tournament.ctx.subCounts.reduce((acc, cur) => {
			if (cur.visibility === "ALL") return acc + cur.count;

			const userPlusTier = user?.plusTier ?? 4;

			switch (cur.visibility) {
				case "+1": {
					return userPlusTier === 1 ? acc + cur.count : acc;
				}
				case "+2": {
					return userPlusTier <= 2 ? acc + cur.count : acc;
				}
				case "+3": {
					return userPlusTier <= 3 ? acc + cur.count : acc;
				}
				default: {
					assertUnreachable(cur.visibility);
				}
			}
		}, 0);

	return (
		<Main bigger>
			<SubNav>
				<SubNavLink
					to={tournamentRegisterPage(
						tournament.isLeagueDivision
							? tournament.ctx.parentTournamentId!
							: tournament.ctx.id,
					)}
					data-testid="register-tab"
					prefetch="intent"
				>
					{tournament.hasStarted || tournament.isLeagueDivision
						? "Info"
						: t("tournament:tabs.register")}
				</SubNavLink>
				{!tournament.isLeagueSignup ? (
					<SubNavLink
						to="brackets"
						data-testid="brackets-tab"
						prefetch="render"
					>
						{t("tournament:tabs.brackets")}
					</SubNavLink>
				) : null}
				{tournament.isLeagueSignup || tournament.isLeagueDivision ? (
					<SubNavLink
						to={tournamentDivisionsPage(
							tournament.ctx.parentTournamentId ?? tournament.ctx.id,
						)}
					>
						Divisions
					</SubNavLink>
				) : null}
				<SubNavLink
					to="teams"
					end={false}
					prefetch="render"
					data-testid="teams-tab"
				>
					{t("tournament:tabs.teams", { count: tournament.ctx.teams.length })}
				</SubNavLink>
				{!tournament.everyBracketOver && tournament.subsFeatureEnabled && (
					<SubNavLink to="subs" end={false}>
						{t("tournament:tabs.subs", { count: subsCount() })}
					</SubNavLink>
				)}
				{tournament.hasStarted && !tournament.everyBracketOver ? (
					<SubNavLink to="streams">
						{t("tournament:tabs.streams", {
							count: data.streamsCount,
						})}
					</SubNavLink>
				) : null}
				{tournament.hasStarted ? (
					<SubNavLink to="results" data-testid="results-tab">
						{t("tournament:tabs.results")}
					</SubNavLink>
				) : null}
				{tournament.isOrganizer(user) &&
					!tournament.hasStarted &&
					!tournament.isLeagueSignup && (
						<SubNavLink to="seeds">{t("tournament:tabs.seeds")}</SubNavLink>
					)}
				{tournament.isOrganizer(user) && !tournament.everyBracketOver && (
					<SubNavLink to="admin" data-testid="admin-tab">
						{t("tournament:tabs.admin")}
					</SubNavLink>
				)}
			</SubNav>
			<TournamentContext.Provider value={tournament}>
				<Outlet
					context={
						{
							tournament,
							bracketExpanded,
							setBracketExpanded,
							streamingParticipants: data.streamingParticipants,
							friendCodes: data.friendCodes,
							preparedMaps: data.preparedMaps,
						} satisfies TournamentContext
					}
				/>
			</TournamentContext.Provider>
		</Main>
	);
}

type TournamentContext = {
	tournament: Tournament;
	bracketExpanded: boolean;
	streamingParticipants: number[];
	setBracketExpanded: (expanded: boolean) => void;
	friendCode?: string;
	friendCodes?: SerializeFrom<typeof loader>["friendCodes"];
	preparedMaps: SerializeFrom<typeof loader>["preparedMaps"];
};

export function useTournament() {
	return useOutletContext<TournamentContext>().tournament;
}

export function useBracketExpanded() {
	const { bracketExpanded, setBracketExpanded } =
		useOutletContext<TournamentContext>();

	return { bracketExpanded, setBracketExpanded };
}

export function useStreamingParticipants() {
	return useOutletContext<TournamentContext>().streamingParticipants;
}

export function useTournamentFriendCodes() {
	return useOutletContext<TournamentContext>().friendCodes;
}

export function useTournamentPreparedMaps() {
	return useOutletContext<TournamentContext>().preparedMaps;
}

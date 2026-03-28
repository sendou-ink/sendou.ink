import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import {
	Outlet,
	type ShouldRevalidateFunction,
	useLoaderData,
	useOutletContext,
} from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { useUser } from "~/features/auth/core/user";
import { useChatContext } from "~/features/chat/useChatContext";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { useHydrated } from "~/hooks/useHydrated";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { removeMarkdown } from "~/utils/strings";
import {
	tournamentDivisionsPage,
	tournamentPage,
	tournamentRegisterPage,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import { loader, type TournamentLoaderData } from "../loaders/to.$id.server";

export { loader };

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	const navigatedToMatchPage =
		typeof args.nextParams.mid === "string" &&
		args.formMethod !== "POST" &&
		args.currentParams.mid !== args.nextParams.mid;

	if (navigatedToMatchPage) return false;

	return args.defaultShouldRevalidate;
};

export const meta: MetaFunction = (args) => {
	const rawData = args.data as string | undefined;

	if (!rawData) return [];

	const data = JSON.parse(rawData) as TournamentLoaderData;

	return metaTags({
		title: data.tournament.ctx.name,
		description: data.tournament.ctx.description
			? removeMarkdown(data.tournament.ctx.description)
			: undefined,
		image: {
			url: data.tournament.ctx.logoUrl,
			dimensions: { width: 124, height: 124 },
		},
		location: args.location,
		url: tournamentPage(data.tournament.ctx.id),
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["tournament", "calendar"],
	breadcrumb: ({ match }) => {
		const rawData = match.data as string | undefined;

		if (!rawData) return [];

		const data = JSON.parse(rawData) as TournamentLoaderData;

		return [
			{
				imgPath: data.tournament.ctx.logoUrl,
				href: tournamentPage(data.tournament.ctx.id),
				type: "IMAGE" as const,
				text: data.tournament.ctx.name,
			},
		];
	},
};

const TournamentContext = React.createContext<Tournament>(null!);

export default function TournamentLayoutShell() {
	const isHydrated = useHydrated();

	// tournaments are something that people like to refresh a lot
	// which can cause spikes that are hard for the server to handle
	// this is just making sure the SSR for this page is as fast as possible in prod
	if (!isHydrated)
		return (
			<Main bigger>
				<Placeholder />
			</Main>
		);

	return <TournamentLayout />;
}

export function TournamentLayout() {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();
	const rawData = useLoaderData<typeof loader>();
	const data = React.useMemo(
		() => JSON.parse(rawData) as TournamentLoaderData,
		[rawData],
	);
	const tournament = React.useMemo(
		() => new Tournament(data.tournament),
		[data],
	);
	const [bracketExpanded, setBracketExpanded] = React.useState(true);

	useTournamentChatLabels(tournament);

	// this is nice to debug with tournament in browser console
	if (process.env.NODE_ENV === "development") {
		// biome-ignore lint/correctness/useHookAtTopLevel: process.env.NODE_ENV is a constant
		React.useEffect(() => {
			// @ts-expect-error for dev purposes
			window.tourney = tournament;
		}, [tournament]);
	}
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
				{!(tournament.isLeagueSignup && data.hasChildTournaments) ? (
					<SubNavLink
						to="teams"
						end={false}
						prefetch="render"
						data-testid="teams-tab"
					>
						{t("tournament:tabs.teams", {
							count: tournament.ctx.teams.length,
						})}
					</SubNavLink>
				) : null}
				{!tournament.isInvitational &&
				!tournament.everyBracketOver &&
				!(tournament.isLeagueSignup && !tournament.registrationOpen) &&
				tournament.lfgEnabled ? (
					<SubNavLink to="looking">
						{tournament.registrationOpen
							? t("tournament:tabs.looking")
							: t("tournament:tabs.subs")}
					</SubNavLink>
				) : null}
				{tournament.hasStarted && !tournament.everyBracketOver ? (
					<SubNavLink to="streams">
						{t("tournament:tabs.streams", {
							count: tournament.streams.length,
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
				{tournament.isOrganizer(user) &&
					(!tournament.ctx.isFinalized ||
						DANGEROUS_CAN_ACCESS_DEV_CONTROLS) && (
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
							hasChildTournaments: data.hasChildTournaments,
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
	setBracketExpanded: (expanded: boolean) => void;
	hasChildTournaments: boolean;
	friendCode?: string;
	friendCodes?: TournamentLoaderData["friendCodes"];
	preparedMaps: TournamentLoaderData["preparedMaps"];
};

export function useTournament() {
	return useOutletContext<TournamentContext>().tournament;
}

export function useBracketExpanded() {
	const { bracketExpanded, setBracketExpanded } =
		useOutletContext<TournamentContext>();

	return { bracketExpanded, setBracketExpanded };
}

export function useHasChildTournaments() {
	return useOutletContext<TournamentContext>().hasChildTournaments;
}

export function useTournamentFriendCodes() {
	return useOutletContext<TournamentContext>().friendCodes;
}

export function useTournamentPreparedMaps() {
	return useOutletContext<TournamentContext>().preparedMaps;
}

function useTournamentChatLabels(tournament: Tournament) {
	const chatContext = useChatContext();
	const setChatLabels = chatContext?.setChatLabels;
	const clearChatLabels = chatContext?.clearChatLabels;

	React.useEffect(() => {
		if (!setChatLabels || !clearChatLabels) return;

		const labels: Record<number, string> = {};

		labels[tournament.ctx.author.id] = "TO";

		for (const staff of tournament.ctx.staff) {
			if (staff.role === "ORGANIZER") {
				labels[staff.id] = "TO";
			} else if (staff.role === "STREAMER") {
				labels[staff.id] = "Stream";
			}
		}

		if (tournament.ctx.organization) {
			for (const member of tournament.ctx.organization.members) {
				if (["ADMIN", "ORGANIZER"].includes(member.role)) {
					labels[member.userId] = "TO";
				} else if (member.role === "STREAMER") {
					labels[member.userId] = "Stream";
				}
			}
		}

		setChatLabels(labels);

		return () => {
			clearChatLabels();
		};
	}, [setChatLabels, clearChatLabels, tournament]);
}

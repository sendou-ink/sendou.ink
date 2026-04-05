import { differenceInMinutes } from "date-fns";
import { ArrowLeft } from "lucide-react";
import * as React from "react";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import {
	MatchBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { assertUnreachable } from "~/utils/types";
import { tournamentBracketsPage } from "~/utils/urls";
import { action } from "../actions/to.$id.matches.$mid.server";
import { getRounds } from "../core/rounds";
import { loader } from "../loaders/to.$id.matches.$mid.server";
import { groupNumberToLetters } from "../tournament-bracket-utils";

export { action, loader };

// xxx: can we simplify loader to return values that are closer to what we want to display?

export default function TournamentMatchPage() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const opponentOne = data.match.opponentOne;
	const opponentTwo = data.match.opponentTwo;

	const scoreSum = (opponentOne?.score ?? 0) + (opponentTwo?.score ?? 0);

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	const activeRosterByTeamId = (tournamentTeamId: number) => {
		const team = tournament.teamById(tournamentTeamId);
		if (!team) return null;

		const activeRosterUserIds = team.activeRosterUserIds;
		if (!activeRosterUserIds?.length) return null;

		return team.members
			.filter((member) => !activeRosterUserIds.includes(member.userId))
			.map((member) => ({ ...member, id: member.userId }));
	};

	return (
		<MatchPage>
			<TournamentMatchHeader />

			<MatchBannerContainer>
				<TournamentMatchBannerTopRow />
				{currentMap ? (
					<MatchBanner
						stageId={currentMap.stageId}
						mode={currentMap.mode}
						screenLegal={!data.noScreen}
					>
						Team 2 pick
					</MatchBanner>
				) : null}
				<MatchBannerBottomRow
					games={
						data.mapList?.map((map, i) => {
							const result = data.results.at(i);
							const winner = result
								? result.winnerTeamId === opponentOne?.id
									? "ALPHA"
									: "BRAVO"
								: undefined;

							return {
								mode: map.mode,
								winner,
							};
						}) ?? []
					}
					activeRosters={
						opponentOne?.id && opponentTwo?.id
							? {
									alpha: activeRosterByTeamId(opponentOne.id),
									bravo: activeRosterByTeamId(opponentTwo.id),
								}
							: null
					}
				/>
			</MatchBannerContainer>

			<TournamentMatchTabs />
		</MatchPage>
	);
}

function TournamentMatchHeader() {
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	const { bracketName, roundName } = React.useMemo(() => {
		let bracketName: string | undefined;
		let roundName: string | undefined;

		for (const bracket of tournament.brackets) {
			if (bracket.preview) continue;

			for (const match of bracket.data.match) {
				if (match.id === data.match.id) {
					bracketName = bracket.name;

					if (bracket.type === "round_robin") {
						const group = bracket.data.group.find(
							(group) => group.id === match.group_id,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.round_id,
						);

						roundName = `Groups ${group?.number ? groupNumberToLetters(group.number) : ""}${round?.number ?? ""}.${match.number}`;
					} else if (bracket.type === "swiss") {
						const group = bracket.data.group.find(
							(group) => group.id === match.group_id,
						);
						const round = bracket.data.round.find(
							(round) => round.id === match.round_id,
						);

						const oneGroupOnly = bracket.data.group.length === 1;

						roundName = `Swiss${oneGroupOnly ? "" : " Group"} ${group?.number && !oneGroupOnly ? groupNumberToLetters(group.number) : ""} ${round?.number ?? ""}.${match.number}`;
					} else if (
						bracket.type === "single_elimination" ||
						bracket.type === "double_elimination"
					) {
						const rounds =
							bracket.type === "single_elimination"
								? getRounds({ type: "single", bracketData: bracket.data })
								: [
										...getRounds({
											type: "winners",
											bracketData: bracket.data,
										}),
										...getRounds({
											type: "losers",
											bracketData: bracket.data,
										}),
									];

						const round = rounds.find((round) => round.id === match.round_id);

						if (round) {
							const specifier = () => {
								if (
									[
										TOURNAMENT.ROUND_NAMES.WB_FINALS,
										TOURNAMENT.ROUND_NAMES.GRAND_FINALS,
										TOURNAMENT.ROUND_NAMES.BRACKET_RESET,
										TOURNAMENT.ROUND_NAMES.FINALS,
										TOURNAMENT.ROUND_NAMES.LB_FINALS,
										TOURNAMENT.ROUND_NAMES.LB_SEMIS,
										TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH,
									].includes(round.name as any)
								) {
									return "";
								}

								const roundNameEndsInDigit = /\d$/.test(round.name);

								if (!roundNameEndsInDigit) {
									return ` ${match.number}`;
								}

								return `.${match.number}`;
							};
							roundName = `${round.name}${specifier()}`;
						}
					} else {
						assertUnreachable(bracket.type);
					}
				}
			}
		}

		return {
			bracketName,
			roundName,
		};
	}, [tournament, data.match.id]);

	return (
		<MatchPageHeader
			// xxx: fix !
			subtitle={bracketName!}
			topRight={
				<LinkButton
					to={tournamentBracketsPage({
						tournamentId: tournament.ctx.id,
						bracketIdx: tournament.matchIdToBracketIdx(data.match.id),
						groupId: data.match.groupId,
					})}
					variant="outlined"
					size="small"
					className="w-max"
					icon={<ArrowLeft />}
					testId="back-to-bracket-button"
				>
					Back to bracket
				</LinkButton>
			}
		>
			{roundName}
		</MatchPageHeader>
	);
}

function TournamentMatchBannerTopRow() {
	const currentTime = new Date();
	const data = useLoaderData<typeof loader>();

	if (
		!data.match.startedAt ||
		!data.match.opponentOne ||
		!data.match.opponentTwo
	)
		return null;

	const totalMinutes = differenceInMinutes(currentTime, data.match.startedAt);

	return (
		<MatchBannerTopRow
			score={{
				alpha: data.match.opponentOne.score ?? 0,
				bravo: data.match.opponentTwo.score ?? 0,
				isFinal:
					data.match.opponentOne?.result === "win" ||
					data.match.opponentTwo?.result === "win",
				count: data.match.roundMaps.count,
				bestOf: data.match.roundMaps.type === "BEST_OF",
			}}
			time={{
				// xxx: current
				currentMinutes: 3,
				totalMinutes,
			}}
		/>
	);
}

function TournamentMatchTabs() {
	return null;

	// return (
	// 	<MatchTabs tabs={["join", "rosters", "action"]}>
	// 		<MatchJoinTab
	// 			joinLink="https://app.nintendo.net/private_battle/abc123"
	// 			hostedBy={{
	// 				id: 1,
	// 				username: "Grey",
	// 				discordId: "123456789",
	// 				discordAvatar: null,
	// 				customUrl: null,
	// 			}}
	// 			pool="SQ7"
	// 			pass="8430"
	// 			showNoSplatnetAlert
	// 		/>
	// 		<MatchRosterTab
	// 			minMembersPerTeam={4}
	// 			canEditSubbedOut={[true, false]}
	// 			onSubbedOutChange={(teamId, subbedOut) => {
	// 				logger.info("onSubbedOutChange", { teamId, subbedOut });
	// 			}}
	// 			teams={[
	// 				{
	// 					team: {
	// 						id: 1,
	// 						name: "me in japan",
	// 						url: "/t/me-in-japan",
	// 					},
	// 					members: [
	// 						{
	// 							id: 1,
	// 							username: "Sendou",
	// 							discordId: "123",
	// 							discordAvatar: null,
	// 							customUrl: "sendou",
	// 						},
	// 						{
	// 							id: 2,
	// 							username: "Lean",
	// 							discordId: "456",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 3,
	// 							username: "Kiver",
	// 							discordId: "789",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 4,
	// 							username: "Brian",
	// 							discordId: "012",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 9,
	// 							username: "Poppy",
	// 							discordId: "567",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 					],
	// 					subbedOut: [9],
	// 				},
	// 				{
	// 					team: {
	// 						id: 2,
	// 						name: "Question Mark",
	// 						url: "/t/question-mark",
	// 					},
	// 					members: [
	// 						{
	// 							id: 5,
	// 							username: "Naga",
	// 							discordId: "345",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 6,
	// 							username: "Grey",
	// 							discordId: "678",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 7,
	// 							username: "Zack",
	// 							discordId: "901",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 						{
	// 							id: 8,
	// 							username: "Lime",
	// 							discordId: "234",
	// 							discordAvatar: null,
	// 							customUrl: null,
	// 						},
	// 					],
	// 				},
	// 			]}
	// 		/>
	// 		<MatchActionTab
	// 			teams={[
	// 				{ id: 1, name: "Chimera" },
	// 				{ id: 2, name: "Koopa Clan" },
	// 			]}
	// 			ownTeamId={1}
	// 			stageId={4}
	// 			mode="SZ"
	// 			withPoints={true}
	// 		/>
	// 	</MatchTabs>
	// );
}

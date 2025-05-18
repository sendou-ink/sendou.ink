import { useLoaderData, useRevalidator } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useEventSource } from "remix-utils/sse/react";
import { LinkButton } from "~/components/Button";
import { containerClassName } from "~/components/Main";
import { ArrowLongLeftIcon } from "~/components/icons/ArrowLongLeft";
import { useUser } from "~/features/auth/core/user";
import { ConnectedChat } from "~/features/chat/components/Chat";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { useVisibilityChange } from "~/hooks/useVisibilityChange";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import {
	tournamentBracketsPage,
	tournamentMatchSubscribePage,
} from "~/utils/urls";
import { CastInfo } from "../components/CastInfo";
import { MatchRosters } from "../components/MatchRosters";
import { OrganizerMatchMapListDialog } from "../components/OrganizerMatchMapListDialog";
import { StartedMatch } from "../components/StartedMatch";
import { getRounds } from "../core/rounds";
import {
	groupNumberToLetters,
	matchSubscriptionKey,
} from "../tournament-bracket-utils";

import { action } from "../actions/to.$id.matches.$mid.server";
import { loader } from "../loaders/to.$id.matches.$mid.server";
export { action, loader };

import "../tournament-bracket.css";

export default function TournamentMatchPage() {
	const user = useUser();
	const visibility = useVisibilityChange();
	const { revalidate } = useRevalidator();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	React.useEffect(() => {
		if (visibility !== "visible" || data.matchIsOver) return;

		revalidate();
	}, [visibility, revalidate, data.matchIsOver]);

	const type =
		tournament.canReportScore({ matchId: data.match.id, user }) ||
		tournament.isOrganizerOrStreamer(user)
			? "EDIT"
			: "OTHER";

	const showRosterPeek = () => {
		if (data.matchIsOver) return false;

		if (!data.match.opponentOne?.id || !data.match.opponentTwo?.id) return true;

		return type !== "EDIT";
	};

	const showChatPeek = () => {
		if (!showRosterPeek()) return false;

		if (tournament.isOrganizerOrStreamer(user)) return true;

		const teamId = tournament.teamMemberOfByUser(user)?.id;
		if (!teamId) return false;

		if (data.match.opponentOne?.id === teamId) return true;
		if (data.match.opponentTwo?.id === teamId) return true;

		return false;
	};

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{!data.matchIsOver && visibility !== "hidden" ? <AutoRefresher /> : null}
			<div className="flex horizontal justify-between items-center">
				<MatchHeader />
				<div className="stack md horizontal flex-wrap-reverse justify-end">
					{tournament.isOrganizerOrStreamer(user) ? (
						<OrganizerMatchMapListDialog data={data} />
					) : null}
					<LinkButton
						to={tournamentBracketsPage({
							tournamentId: tournament.ctx.id,
							bracketIdx: tournament.matchIdToBracketIdx(data.match.id),
							groupId: data.match.groupId,
						})}
						variant="outlined"
						size="tiny"
						className="w-max"
						icon={<ArrowLongLeftIcon />}
						testId="back-to-bracket-button"
					>
						Back to bracket
					</LinkButton>
				</div>
			</div>
			<div className="stack md">
				<CastInfo
					matchIsOngoing={Boolean(
						(data.match.opponentOne?.score &&
							data.match.opponentOne.score > 0) ||
							(data.match.opponentTwo?.score &&
								data.match.opponentTwo.score > 0),
					)}
					matchIsOver={data.matchIsOver}
					matchId={data.match.id}
					hasBothParticipants={Boolean(
						data.match.opponentOne?.id && data.match.opponentTwo?.id,
					)}
				/>
				{data.matchIsOver ? <ResultsSection /> : null}
				{!data.matchIsOver &&
				typeof data.match.opponentOne?.id === "number" &&
				typeof data.match.opponentTwo?.id === "number" ? (
					<MapListSection
						teams={[data.match.opponentOne.id, data.match.opponentTwo.id]}
						type={type}
					/>
				) : null}
				{showRosterPeek() ? (
					<MatchRosters
						teams={[data.match.opponentOne?.id, data.match.opponentTwo?.id]}
					/>
				) : null}
				{showChatPeek() ? <BeforeMatchChat /> : null}
			</div>
		</div>
	);
}

function BeforeMatchChat() {
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	// TODO: resolve this on server (notice it is copy-pasted now)
	const chatUsers = React.useMemo(() => {
		return Object.fromEntries(
			[
				...data.match.players.map((p) => ({ ...p, title: undefined })),
				...(tournament.ctx.organization?.members ?? []).map((m) => ({
					...m,
					title: m.role === "STREAMER" ? "Stream" : "TO",
				})),
				...tournament.ctx.staff.map((s) => ({
					...s,
					title: s.role === "STREAMER" ? "Stream" : "TO",
				})),
				{
					...tournament.ctx.author,
					title: "TO",
				},
			].map((p) => [p.id, p]),
		);
	}, [data, tournament]);

	const rooms = React.useMemo(() => {
		return data.match.chatCode
			? [
					{
						code: data.match.chatCode,
						label: "Match",
					},
				]
			: [];
	}, [data.match.chatCode]);

	return (
		<div className="tournament__action-section mt-6">
			<ConnectedChat
				rooms={rooms}
				users={chatUsers}
				className="tournament__chat-container"
				messagesContainerClassName="tournament__chat-messages-container"
				missingUserName="???"
			/>
		</div>
	);
}

function MatchHeader() {
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
										...getRounds({ type: "losers", bracketData: bracket.data }),
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
		<div className="line-height-tight" data-testid="match-header">
			<h2 className="text-lg">{roundName}</h2>
			{tournament.ctx.settings.bracketProgression.length > 1 ? (
				<div className="text-lighter text-xs font-bold">{bracketName}</div>
			) : null}
		</div>
	);
}

function AutoRefresher() {
	useAutoRefresh();

	return null;
}

function useAutoRefresh() {
	const { revalidate } = useRevalidator();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const lastEventId = useEventSource(
		tournamentMatchSubscribePage({
			tournamentId: tournament.ctx.id,
			matchId: data.match.id,
		}),
		{
			event: matchSubscriptionKey(data.match.id),
		},
	);

	React.useEffect(() => {
		if (lastEventId) {
			revalidate();
		}
	}, [lastEventId, revalidate]);
}

function MapListSection({
	teams,
	type,
}: {
	teams: [id: number, id: number];
	type: "EDIT" | "OTHER";
}) {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const teamOneId = teams[0];
	const teamOne = React.useMemo(
		() => tournament.teamById(teamOneId),
		[teamOneId, tournament],
	);
	const teamTwoId = teams[1];
	const teamTwo = React.useMemo(
		() => tournament.teamById(teamTwoId),
		[teamTwoId, tournament],
	);

	if (!teamOne || !teamTwo) return null;

	invariant(data.mapList, "No mapList found for this map list");

	const scoreSum =
		(data.match.opponentOne?.score ?? 0) + (data.match.opponentTwo?.score ?? 0);

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	return (
		<StartedMatch
			currentStageWithMode={currentMap}
			teams={[teamOne, teamTwo]}
			type={type}
		/>
	);
}

function ResultsSection() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const [selectedResultIndex, setSelectedResultIndex] = useSearchParamState({
		defaultValue: data.results.length - 1,
		name: "result",
		revive: (value) => {
			const maybeIndex = Number(value);
			if (!Number.isInteger(maybeIndex)) return;
			if (maybeIndex < 0 || maybeIndex >= data.results.length) return;

			return maybeIndex;
		},
	});

	const result = data.results[selectedResultIndex];
	invariant(result, "Result is missing");

	const teamOne = data.match.opponentOne?.id
		? tournament.teamById(data.match.opponentOne.id)
		: undefined;
	const teamTwo = data.match.opponentTwo?.id
		? tournament.teamById(data.match.opponentTwo.id)
		: undefined;

	if (!teamOne || !teamTwo) {
		throw new Error("Team is missing");
	}

	const resultSource = data.mapList?.find(
		(m) => m.stageId === result.stageId && m.mode === result.mode,
	)?.source;

	return (
		<StartedMatch
			currentStageWithMode={{ ...result, source: resultSource ?? "TO" }}
			teams={[teamOne, teamTwo]}
			selectedResultIndex={selectedResultIndex}
			setSelectedResultIndex={setSelectedResultIndex}
			result={result}
			type="OTHER"
		/>
	);
}

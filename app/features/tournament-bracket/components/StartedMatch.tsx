import type { SerializeFrom } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { NewTabs } from "~/components/NewTabs";
import { Popover } from "~/components/Popover";
import { SubmitButton } from "~/components/SubmitButton";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { CrossIcon } from "~/components/icons/Cross";
import { PickIcon } from "~/components/icons/Pick";
import { useUser } from "~/features/auth/core/user";
import { Chat, useChat } from "~/features/chat/components/Chat";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import type { StageId } from "~/modules/in-game-lists";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import type { Unpacked } from "~/utils/types";
import {
	modeImageUrl,
	specialWeaponImageUrl,
	stageImageUrl,
} from "~/utils/urls";
import type { Bracket } from "../core/Bracket";
import * as PickBan from "../core/PickBan";
import type { TournamentDataTeam } from "../core/Tournament.server";
import type { TournamentMatchLoaderData } from "../routes/to.$id.matches.$mid";
import {
	groupNumberToLetter,
	mapCountPlayedInSetWithCertainty,
	matchIsLocked,
	pickInfoText,
	resolveHostingTeam,
	resolveRoomPass,
	tournamentTeamToActiveRosterUserIds,
} from "../tournament-bracket-utils";
import { MatchActions } from "./MatchActions";
import { MatchRosters } from "./MatchRosters";

export type Result = Unpacked<
	SerializeFrom<TournamentMatchLoaderData>["results"]
>;

export function StartedMatch({
	teams,
	currentStageWithMode,
	selectedResultIndex,
	setSelectedResultIndex,
	result,
	type,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
	result?: Result;
	currentStageWithMode?: TournamentMapListMap;
	selectedResultIndex?: number;
	// if this is set it means the component is being used in presentation manner
	setSelectedResultIndex?: (index: number) => void;
	type: "EDIT" | "OTHER";
}) {
	const { t } = useTranslation(["tournament"]);
	const isMounted = useIsMounted();
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();

	const scoreOne = data.match.opponentOne?.score ?? 0;
	const scoreTwo = data.match.opponentTwo?.score ?? 0;

	const currentPosition = scoreOne + scoreTwo;

	const presentational = Boolean(setSelectedResultIndex);

	const showFullInfos = !presentational && type === "EDIT";

	const isMemberOfTeamParticipating = data.match.players.some(
		(p) => p.id === user?.id,
	);

	const hostingTeamId = resolveHostingTeam(teams).id;
	const poolCode = React.useMemo(() => {
		const match = tournament.brackets
			.flatMap((b) => b.data.match)
			.find((m) => m.id === data.match.id);

		const hasRoundRobin = tournament.brackets.some(
			(b) => b.type === "round_robin",
		);
		const bracketIdx = tournament.brackets.findIndex((b) =>
			b.data.match.some((m) => m.id === data.match.id),
		);
		const bracket = tournament.brackets[bracketIdx] as Bracket | undefined;
		const group = tournament.brackets
			.flatMap((b) => b.data.group)
			.find((group) => group.id === match?.group_id);
		return tournament.resolvePoolCode({
			hostingTeamId,
			groupLetter:
				group && bracket?.type === "round_robin"
					? groupNumberToLetter(group.number)
					: undefined,
			bracketNumber:
				hasRoundRobin && bracket?.type !== "round_robin"
					? bracketIdx + 1
					: undefined,
		});
	}, [tournament, hostingTeamId, data.match.id]);

	const roundInfos = [
		showFullInfos ? (
			<React.Fragment key="hosts">
				{t("tournament:match.hosts", {
					teamName: resolveHostingTeam(teams).name,
				})}
			</React.Fragment>
		) : null,
		showFullInfos ? (
			<React.Fragment key="pass">
				{t("tournament:match.pass")}{" "}
				<span className="text-theme font-bold" data-testid="room-pass">
					{resolveRoomPass(data.match.id)}
				</span>
			</React.Fragment>
		) : null,
		showFullInfos ? (
			<span key="pool">
				{t("tournament:match.pool")} {poolCode.prefix}
				<span className="text-theme font-bold">{poolCode.suffix}</span>
			</span>
		) : null,
		<React.Fragment key="score">
			{data.match.roundMaps?.type === "PLAY_ALL"
				? t("tournament:match.score.playAll", {
						scoreOne,
						scoreTwo,
						bestOf: data.match.bestOf,
					})
				: t("tournament:match.score", {
						scoreOne,
						scoreTwo,
						bestOf: data.match.bestOf,
					})}
		</React.Fragment>,
		tournament.ctx.settings.enableNoScreenToggle ? (
			<ScreenBanIcons
				key="screen-ban"
				banned={teams.some((team) => team.noScreen)}
			/>
		) : null,
	];

	return (
		<div className="tournament-bracket__during-match-actions">
			<FancyStageBanner
				stage={currentStageWithMode}
				infos={roundInfos}
				teams={teams}
				matchIsLocked={matchIsLocked({
					matchId: data.match.id,
					scores: [scoreOne, scoreTwo],
					tournament,
				})}
			>
				{currentPosition > 0 &&
					!presentational &&
					type === "EDIT" &&
					(tournament.isOrganizer(user) || isMemberOfTeamParticipating) && (
						<Form method="post">
							<input
								type="hidden"
								name="position"
								value={currentPosition - 1}
							/>
							<div className="tournament-bracket__stage-banner__bottom-bar">
								<SubmitButton
									_action="UNDO_REPORT_SCORE"
									className="tournament-bracket__stage-banner__undo-button"
									testId="undo-score-button"
								>
									{t("tournament:match.action.undoLastScore")}
								</SubmitButton>
							</div>
						</Form>
					)}
				{tournament.isOrganizer(user) &&
					tournament.matchCanBeReopened(data.match.id) &&
					presentational && (
						<Form method="post">
							<div className="tournament-bracket__stage-banner__bottom-bar">
								<SubmitButton
									_action="REOPEN_MATCH"
									className="tournament-bracket__stage-banner__undo-button"
									testId="reopen-match-button"
								>
									{t("tournament:match.action.reopenMatch")}
								</SubmitButton>
							</div>
						</Form>
					)}
			</FancyStageBanner>
			<ModeProgressIndicator
				scores={[scoreOne, scoreTwo]}
				bestOf={data.match.bestOf}
				selectedResultIndex={selectedResultIndex}
				setSelectedResultIndex={setSelectedResultIndex}
			/>
			{type === "EDIT" || presentational ? (
				<StartedMatchTabs
					presentational={presentational}
					scores={[scoreOne, scoreTwo]}
					teams={teams}
					result={result}
				/>
			) : null}
			{result ? (
				<div
					className={clsx("text-center text-xs text-lighter", {
						invisible: !isMounted,
					})}
					data-testid="report-timestamp"
				>
					{isMounted
						? databaseTimestampToDate(result.createdAt).toLocaleString()
						: "t"}
				</div>
			) : null}
		</div>
	);
}

function FancyStageBanner({
	stage,
	infos,
	children,
	teams,
	matchIsLocked,
}: {
	stage?: TournamentMapListMap;
	infos?: (JSX.Element | null)[];
	children?: React.ReactNode;
	teams: [TournamentDataTeam, TournamentDataTeam];
	matchIsLocked: boolean;
}) {
	const data = useLoaderData<TournamentMatchLoaderData>();
	const { t } = useTranslation(["game-misc", "tournament"]);
	const tournament = useTournament();

	const stageNameToBannerImageUrl = (stageId: StageId) => {
		return `${stageImageUrl(stageId)}.png`;
	};

	const banPickingTeam = () => {
		if (
			!data.match.roundMaps ||
			!data.match.opponentOne?.id ||
			!data.match.opponentTwo?.id
		) {
			return null;
		}

		const pickingTeamId = PickBan.turnOf({
			results: data.results,
			maps: data.match.roundMaps,
			teams: [data.match.opponentOne.id, data.match.opponentTwo.id],
			mapList: data.mapList,
		});

		return pickingTeamId ? teams.find((t) => t.id === pickingTeamId) : null;
	};

	const style = {
		"--_tournament-bg-url": stage
			? `url("${stageNameToBannerImageUrl(stage.stageId)}")`
			: undefined,
	};

	const inBanPhase =
		data.match.roundMaps?.pickBan === "BAN_2" &&
		data.mapList &&
		data.mapList.filter((m) => m.bannedByTournamentTeamId).length < 2;

	const waitingForActiveRosterSelectionFor = (() => {
		if (data.results.length > 0) return null;

		const teamOneMissing = !tournamentTeamToActiveRosterUserIds(
			teams[0],
			tournament.minMembersPerTeam,
		);
		const teamTwoMissing = !tournamentTeamToActiveRosterUserIds(
			teams[1],
			tournament.minMembersPerTeam,
		);

		if (teamOneMissing && teamTwoMissing) {
			return "BOTH";
		}

		if (teamOneMissing) {
			return teams[0].name;
		}

		if (teamTwoMissing) {
			return teams[1].name;
		}

		return null;
	})();

	return (
		<>
			{inBanPhase ? (
				<div className="tournament-bracket__locked-banner">
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">Banning phase</div>
						<div>Waiting for {banPickingTeam()?.name}</div>
					</div>
				</div>
			) : !stage ? (
				<div className="tournament-bracket__locked-banner">
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">Counterpick</div>
						<div>Waiting for {banPickingTeam()?.name}</div>
						{children}
					</div>
				</div>
			) : matchIsLocked ? (
				<div className="tournament-bracket__locked-banner">
					<div className="stack sm items-center">
						<div className="text-lg text-center font-bold">
							Match locked to be casted
						</div>
						<div>Please wait for staff to unlock</div>
					</div>
				</div>
			) : waitingForActiveRosterSelectionFor ? (
				<div className="tournament-bracket__locked-banner">
					<div className="stack sm items-center">
						<div
							className="text-lg text-center font-bold"
							data-testid="active-roster-needed-text"
						>
							Active rosters need to be selected
						</div>
						<div>
							Waiting on{" "}
							{waitingForActiveRosterSelectionFor === "BOTH"
								? "both teams"
								: waitingForActiveRosterSelectionFor}
						</div>
					</div>
				</div>
			) : (
				<div
					className={clsx("tournament-bracket__stage-banner", {
						rounded: !infos,
					})}
					style={style}
					data-testid="stage-banner"
				>
					<div className="tournament-bracket__stage-banner__top-bar">
						<h4 className="tournament-bracket__stage-banner__top-bar__header">
							<Image
								className="tournament-bracket__stage-banner__top-bar__mode-image"
								path={modeImageUrl(stage.mode)}
								alt=""
								width={24}
							/>
							<span className="tournament-bracket__stage-banner__top-bar__map-text-small">
								{t(`game-misc:MODE_SHORT_${stage.mode}`)}{" "}
								{t(`game-misc:STAGE_${stage.stageId}`)}
							</span>
							<span className="tournament-bracket__stage-banner__top-bar__map-text-big">
								{t(`game-misc:MODE_LONG_${stage.mode}`)} on{" "}
								{t(`game-misc:STAGE_${stage.stageId}`)}
							</span>
						</h4>
						<h4>
							{pickInfoText({
								t: t as unknown as TFunction<["tournament"]>,
								teams,
								map: stage,
							})}
						</h4>
					</div>
					{children}
				</div>
			)}
			{infos && (
				<div className="tournament-bracket__infos">
					{infos.filter(Boolean).map((info, i) => (
						<div key={i}>{info}</div>
					))}
				</div>
			)}
		</>
	);
}

function ModeProgressIndicator({
	scores,
	bestOf,
	selectedResultIndex,
	setSelectedResultIndex,
}: {
	scores: [number, number];
	bestOf: number;
	selectedResultIndex?: number;
	setSelectedResultIndex?: (index: number) => void;
}) {
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const { t } = useTranslation(["game-misc"]);

	const maxIndexThatWillBePlayedForSure =
		data.match.roundMaps?.type === "PLAY_ALL"
			? bestOf - 1
			: mapCountPlayedInSetWithCertainty({ bestOf, scores }) - 1;

	const indexWithBansConsider = (realIdx: number) => {
		let result = 0;

		for (const [idx, map] of (data.mapList ?? []).entries()) {
			if (idx === realIdx) {
				break;
			}

			if (map.bannedByTournamentTeamId) {
				continue;
			}

			result++;
		}

		return result;
	};

	// TODO: this should be button when we click on it
	return (
		<div className="tournament-bracket__mode-progress">
			{nullFilledArray(
				Math.max(data.mapList?.length ?? 0, data.match.roundMaps?.count ?? 0),
			).map((_, i) => {
				const map = data.mapList?.[i];

				const adjustedI = indexWithBansConsider(i);

				if (
					data.matchIsOver &&
					!data.results[adjustedI] &&
					!map?.bannedByTournamentTeamId
				) {
					return null;
				}

				if (!map?.mode) {
					return (
						<div key={i} className="tournament-bracket__mode-progress__image">
							<PickIcon />
						</div>
					);
				}

				if (map.bannedByTournamentTeamId) {
					const bannerTeamName = tournament.ctx.teams.find(
						(t) => t.id === map.bannedByTournamentTeamId,
					)?.name;

					return (
						<Popover
							key={i}
							triggerClassName="minimal tiny tournament-bracket__mode-progress__image__banned__popover-trigger"
							buttonChildren={
								<Image
									containerClassName="tournament-bracket__mode-progress__image tournament-bracket__mode-progress__image__banned"
									path={modeImageUrl(map.mode)}
									height={20}
									width={20}
									alt={t(`game-misc:MODE_LONG_${map.mode}`)}
								/>
							}
						>
							<div className="text-center">
								{t(`game-misc:MODE_SHORT_${map.mode}`)}{" "}
								{t(`game-misc:STAGE_${map.stageId}`)}
							</div>
							<div className="text-xs text-lighter">
								Banned by {bannerTeamName}
							</div>
						</Popover>
					);
				}

				return (
					<Image
						containerClassName={clsx(
							"tournament-bracket__mode-progress__image",
							{
								"tournament-bracket__mode-progress__image__notable":
									adjustedI <= maxIndexThatWillBePlayedForSure,
								"tournament-bracket__mode-progress__image__team-one-win":
									data.results[adjustedI] &&
									data.results[adjustedI].winnerTeamId ===
										data.match.opponentOne?.id,
								"tournament-bracket__mode-progress__image__team-two-win":
									data.results[adjustedI] &&
									data.results[adjustedI].winnerTeamId ===
										data.match.opponentTwo?.id,
								"tournament-bracket__mode-progress__image__selected":
									adjustedI === selectedResultIndex,
								"cursor-pointer": Boolean(setSelectedResultIndex),
							},
						)}
						key={i}
						path={modeImageUrl(map.mode)}
						height={20}
						width={20}
						alt={t(`game-misc:MODE_LONG_${map.mode}`)}
						title={t(`game-misc:MODE_LONG_${map.mode}`)}
						onClick={() => setSelectedResultIndex?.(adjustedI)}
						testId={`mode-progress-${map.mode}`}
					/>
				);
			})}
		</div>
	);
}

function StartedMatchTabs({
	presentational,
	scores,
	teams,
	result,
}: {
	presentational?: boolean;
	scores: [number, number];
	teams: [TournamentDataTeam, TournamentDataTeam];
	result?: Result;
}) {
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const [_unseenMessages, setUnseenMessages] = React.useState(0);
	const [chatVisible, setChatVisible] = React.useState(false);
	const [selectedTabIndex, setSelectedTabIndex] = useSearchParamState({
		defaultValue: 0,
		name: "tab",
		revive: (value) => [0, 1, 2].find((idx) => idx === Number(value)),
	});

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

	const showChat = (() => {
		if (!data.match.chatCode) return false;
		if (tournament.ctx.isFinalized && !tournament.isOrganizer(user)) {
			return false;
		}
		const oneMonthAgo = new Date();
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
		if (tournament.ctx.startTime < oneMonthAgo) {
			return false;
		}

		return (
			data.match.players.some((p) => p.id === user?.id) ||
			tournament.isOrganizerOrStreamer(user)
		);
	})();

	const rooms = React.useMemo(() => {
		return showChat && data.match.chatCode
			? [
					{
						code: data.match.chatCode,
						label: "Match",
					},
				]
			: [];
	}, [showChat, data.match.chatCode]);

	const onNewMessage = React.useCallback(() => {
		setUnseenMessages((msg) => msg + 1);
	}, []);

	const chat = useChat({ rooms, onNewMessage });

	const onChatMount = React.useCallback(() => {
		setChatVisible(true);
	}, []);

	const onChatUnmount = React.useCallback(() => {
		setChatVisible(false);
		setUnseenMessages(0);
	}, []);

	const unseenMessages = chatVisible ? 0 : _unseenMessages;

	const currentPosition = scores[0] + scores[1];

	const matchActionsKey = () =>
		[
			data.match.id,
			tournamentTeamToActiveRosterUserIds(
				teams[0],
				tournament.minMembersPerTeam,
			),
			tournamentTeamToActiveRosterUserIds(
				teams[1],
				tournament.minMembersPerTeam,
			),
			result?.participantIds,
			result?.opponentOnePoints,
			result?.opponentTwoPoints,
		].join("-");

	return (
		<ActionSectionWrapper>
			<NewTabs
				tabs={[
					{
						label: "Chat",
						number: unseenMessages,
						hidden: !showChat,
					},
					{
						label: "Rosters",
					},
					{
						label: presentational ? "Score" : "Actions",
					},
				]}
				disappearing
				content={[
					{
						key: "chat",
						hidden: !showChat,
						element: (
							<>
								{showChat ? (
									<Chat
										rooms={rooms}
										users={chatUsers}
										className="w-full q__chat-container"
										messagesContainerClassName="q__chat-messages-container"
										chat={chat}
										onMount={onChatMount}
										onUnmount={onChatUnmount}
										missingUserName="???"
									/>
								) : null}
							</>
						),
					},
					{
						key: "rosters",
						element: <MatchRosters teams={[teams[0].id, teams[1].id]} />,
					},
					{
						key: "report",
						unmount: false,
						element: (
							<MatchActions
								// Without the key prop when switching to another match the winnerId is remembered
								// which causes "No winning team matching the id" error.
								// In addition we want the active roster changing either by the user or by another user
								// to reset the state inside.
								// Switching the key props forces the component to remount.
								key={matchActionsKey()}
								scores={scores}
								teams={teams}
								position={currentPosition}
								result={result}
								presentational={
									!tournament.canReportScore({ matchId: data.match.id, user })
								}
							/>
						),
					},
				]}
				selectedIndex={selectedTabIndex}
				setSelectedIndex={setSelectedTabIndex}
			/>
		</ActionSectionWrapper>
	);
}

function ActionSectionWrapper({
	children,
	icon,
	...rest
}: {
	children: React.ReactNode;
	icon?: "warning" | "info" | "success" | "error";
	"justify-center"?: boolean;
}) {
	// todo: flex-dir: column on mobile
	const style = icon
		? {
				"--action-section-icon-color": `var(--theme-${icon})`,
			}
		: undefined;
	return (
		<section className="tournament__action-section" style={style}>
			<div
				className={clsx("tournament__action-section__content", {
					"justify-center": rest["justify-center"],
				})}
			>
				{children}
			</div>
		</section>
	);
}

function ScreenBanIcons({ banned }: { banned: boolean }) {
	const { t } = useTranslation(["weapons"]);

	return (
		<div
			className={clsx("tournament-bracket__no-screen", {
				"tournament-bracket__no-screen__banned": banned,
			})}
			data-testid={`screen-${banned ? "banned" : "allowed"}`}
		>
			{banned ? <CrossIcon /> : <CheckmarkIcon />}
			<Image
				path={specialWeaponImageUrl(SPLATTERCOLOR_SCREEN_ID)}
				width={24}
				height={24}
				alt={t(`weapons:SPECIAL_${SPLATTERCOLOR_SCREEN_ID}`)}
			/>
		</div>
	);
}

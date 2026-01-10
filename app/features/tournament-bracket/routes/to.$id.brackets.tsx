import { sub } from "date-fns";
import { Check, Eye, EyeOff, Map as MapIcon } from "lucide-react";
import * as React from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { Outlet, useOutletContext, useRevalidator } from "react-router";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { useUser } from "~/features/auth/core/user";
import { useWebsocketRevalidation } from "~/features/chat/chat-hooks";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { tournamentWebsocketRoom } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { useVisibilityChange } from "~/hooks/useVisibilityChange";
import { SENDOU_INK_BASE_URL, tournamentJoinPage } from "~/utils/urls";
import {
	useBracketExpanded,
	useTournament,
	useTournamentPreparedMaps,
} from "../../tournament/routes/to.$id";
import { action } from "../actions/to.$id.brackets.server";
import { Bracket } from "../components/Bracket";
import { BracketMapListDialog } from "../components/BracketMapListDialog";
import { TournamentTeamActions } from "../components/TournamentTeamActions";
import type { Bracket as BracketType } from "../core/Bracket";
import * as PreparedMaps from "../core/PreparedMaps";
export { action };

import styles from "../tournament-bracket.module.css";

export default function TournamentBracketsPage() {
	const { t } = useTranslation(["tournament"]);
	const { formatDateTime, formatTime } = useTimeFormat();
	const visibility = useVisibilityChange();
	const { revalidate } = useRevalidator();
	const user = useUser();
	const tournament = useTournament();
	const isMounted = useIsMounted();
	const ctx = useOutletContext();

	useWebsocketRevalidation({
		room: tournamentWebsocketRoom(tournament.ctx.id),
		connected: !tournament.ctx.isFinalized,
	});

	const defaultBracketIdx = () => {
		if (
			tournament.brackets.length === 1 ||
			tournament.brackets[1].isUnderground ||
			!tournament.brackets[0].everyMatchOver
		) {
			return 0;
		}

		return 1;
	};
	const [bracketIdx, setBracketIdx] = useSearchParamState({
		defaultValue: defaultBracketIdx(),
		name: "idx",
		revive: Number,
	});

	const bracket = React.useMemo(
		() => tournament.bracketByIdxOrDefault(bracketIdx),
		[tournament, bracketIdx],
	);

	React.useEffect(() => {
		if (visibility !== "visible" || tournament.ctx.isFinalized) return;

		revalidate();
	}, [visibility, revalidate, tournament.ctx.isFinalized]);

	const teamProgressStatus = tournament.teamMemberOfProgressStatus(user);
	const showAddSubsButton =
		!tournament.canFinalize(user) &&
		!tournament.everyBracketOver &&
		tournament.hasStarted &&
		tournament.autonomousSubs &&
		teamProgressStatus?.type !== "THANKS_FOR_PLAYING";

	const showPrepareMapsButton =
		tournament.isOrganizer(user) &&
		!bracket.canBeStarted &&
		bracket.preview &&
		isMounted;

	const waitingForTeamsText = () => {
		if (bracketIdx > 0 || tournament.regularCheckInStartInThePast) {
			return t("tournament:bracket.waiting.checkin", {
				count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
			});
		}

		return t("tournament:bracket.waiting", {
			count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
		});
	};

	const teamsSourceText = () => {
		if (
			tournament.brackets[0].type === "round_robin" &&
			!bracket.isUnderground
		) {
			return `Teams that place in the top ${Math.max(
				...(bracket.sources ?? []).flatMap((s) => s.placements),
			)} of their group will advance to this stage`;
		}

		if (
			tournament.brackets[0].type === "round_robin" &&
			bracket.isUnderground
		) {
			const placements = (
				bracket.sources?.flatMap((s) => s.placements) ?? []
			).sort((a, b) => a - b);

			return `Teams that don't advance to the final stage can play in this bracket (placements: ${placements.join(", ")})`;
		}

		if (
			tournament.brackets[0].type === "double_elimination" &&
			bracket.isUnderground
		) {
			return `Teams that get eliminated in the first ${Math.abs(
				Math.min(...(bracket.sources ?? []).flatMap((s) => s.placements)),
			)} rounds of the losers bracket can play in this bracket`;
		}

		const advanceThreshold = tournament.brackets[0].settings?.advanceThreshold;
		if (
			advanceThreshold &&
			tournament.ctx.settings.bracketProgression[bracketIdx].sources?.[0]
				.placements.length === 0
		) {
			return `Teams that win at least ${advanceThreshold} sets in the Swiss bracket will advance to this stage`;
		}

		return null;
	};

	const totalTeamsAvailableForTheBracket = () => {
		if (bracket.sources) {
			return (
				(bracket.teamsPendingCheckIn ?? []).length +
				bracket.participantTournamentTeamIds.length
			);
		}

		if (!tournament.isMultiStartingBracket) {
			return tournament.ctx.teams.length;
		}

		return tournament.ctx.teams.filter(
			(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
		).length;
	};

	if (tournament.isLeagueSignup) {
		return null;
	}

	return (
		<div>
			<Outlet context={ctx} />
			{tournament.canFinalize(user) ? (
				<div className={styles.finalize}>
					<LinkButton
						variant="minimal"
						testId="finalize-tournament-button"
						to="finalize"
					>
						{t("tournament:actions.finalize.question")}
					</LinkButton>
				</div>
			) : null}
			{bracket.preview &&
			bracket.enoughTeams &&
			tournament.isOrganizer(user) &&
			tournament.regularCheckInStartInThePast ? (
				<div className="stack items-center mb-4">
					<div className="stack sm items-center">
						<Alert
							variation="INFO"
							alertClassName={styles.startBracketAlert}
							textClassName="stack horizontal md items-center"
						>
							{bracket.participantTournamentTeamIds.length}/
							{totalTeamsAvailableForTheBracket()} teams checked in
							{bracket.canBeStarted ? (
								<BracketStarter bracket={bracket} bracketIdx={bracketIdx} />
							) : null}
						</Alert>
						{!bracket.canBeStarted ? (
							<div className={styles.miniAlert}>
								⚠️{" "}
								{bracket.isStartingBracket
									? "Tournament start time is in the future"
									: bracket.startTime && bracket.startTime > new Date()
										? "Bracket start time is in the future"
										: "Teams pending from the previous bracket"}{" "}
								(blocks starting)
							</div>
						) : null}
					</div>
				</div>
			) : null}
			<div className="stack horizontal mb-4 sm justify-between items-center">
				{/** TournamentTeamActions more confusing than helpful for leagues, for example might say "Waiting for match..." when previous match was rescheduled  */}
				{!tournament.isLeagueDivision ? <TournamentTeamActions /> : null}
				{showAddSubsButton ? <AddSubsPopOver /> : null}
			</div>
			<div className="stack horizontal sm mb-4">
				{bracket.type !== "round_robin" && !bracket.preview ? (
					<CompactifyButton />
				) : null}
				{showPrepareMapsButton ? (
					// Error Boundary because preparing maps is optional, so no need to make the whole page inaccessible if it fails
					<ErrorBoundary fallback={null}>
						<MapPreparer bracket={bracket} bracketIdx={bracketIdx} />
					</ErrorBoundary>
				) : null}
			</div>
			<BracketTabs bracketIdx={bracketIdx} setBracketIdx={setBracketIdx}>
				{(currentBracket, currentBracketIdx) => (
					<BracketTabContent
						bracket={currentBracket}
						bracketIdx={currentBracketIdx}
						waitingForTeamsText={waitingForTeamsText}
						teamsSourceText={teamsSourceText}
						formatDateTime={formatDateTime}
						formatTime={formatTime}
					/>
				)}
			</BracketTabs>
		</div>
	);
}

function BracketStarter({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const isMounted = useIsMounted();

	const close = React.useCallback(() => {
		setDialogOpen(false);
	}, []);

	return (
		<>
			{isMounted && dialogOpen ? (
				<BracketMapListDialog
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
				/>
			) : null}
			<SendouButton
				variant="outlined"
				size="small"
				data-testid="finalize-bracket-button"
				onPress={() => setDialogOpen(true)}
			>
				Start the bracket
			</SendouButton>
		</>
	);
}

function MapPreparer({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const isMounted = useIsMounted();
	const prepared = useTournamentPreparedMaps();
	const tournament = useTournament();

	const hasPreparedMaps = Boolean(
		PreparedMaps.resolvePreparedForTheBracket({
			bracketIdx,
			preparedByBracket: prepared,
			tournament,
		}),
	);

	const close = React.useCallback(() => {
		setDialogOpen(false);
	}, []);

	return (
		<>
			{isMounted && dialogOpen ? (
				<BracketMapListDialog
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					isPreparing
				/>
			) : null}
			<div className="stack sm horizontal ml-auto">
				{hasPreparedMaps ? <Check className="color-success w-6" /> : null}
				<SendouButton
					size="small"
					variant="outlined"
					icon={<MapIcon />}
					onPress={() => setDialogOpen(true)}
					data-testid="prepare-maps-button"
				>
					Prepare maps
				</SendouButton>
			</div>
		</>
	);
}

function AddSubsPopOver() {
	const { t } = useTranslation(["common", "tournament"]);
	const [, copyToClipboard] = useCopyToClipboard();
	const tournament = useTournament();
	const user = useUser();

	const ownedTeam = tournament.ownedTeamByUser(user);
	if (!ownedTeam) {
		const teamMemberOf = tournament.teamMemberOfByUser(user);
		if (!teamMemberOf) return null;

		return <SubsPopover>Only team captain or a TO can add subs</SubsPopover>;
	}

	const subsAvailableToAdd =
		tournament.maxMembersPerTeam - ownedTeam.members.length;

	const inviteLink = `${SENDOU_INK_BASE_URL}${tournamentJoinPage({
		tournamentId: tournament.ctx.id,
		inviteCode: ownedTeam.inviteCode,
	})}`;

	return (
		<SubsPopover>
			{t("tournament:actions.sub.prompt", { count: subsAvailableToAdd })}
			{subsAvailableToAdd > 0 ? (
				<>
					<Divider className="my-2" />
					<div>{t("tournament:actions.shareLink", { inviteLink })}</div>
					<div className="my-2 flex justify-center">
						<SendouButton
							size="small"
							onPress={() => copyToClipboard(inviteLink)}
							variant="minimal"
							className="tiny"
							data-testid="copy-invite-link-button"
						>
							{t("common:actions.copyToClipboard")}
						</SendouButton>
					</div>
				</>
			) : null}
		</SubsPopover>
	);
}

function SubsPopover({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<SendouPopover
			popoverClassName="text-xs"
			trigger={
				<SendouButton
					className="ml-auto"
					variant="outlined"
					size="small"
					data-testid="add-sub-button"
				>
					{t("tournament:actions.addSub")}
				</SendouButton>
			}
		>
			{children}
		</SendouPopover>
	);
}

function BracketTabs({
	bracketIdx,
	setBracketIdx,
	children,
}: {
	bracketIdx: number;
	setBracketIdx: (bracketIdx: number) => void;
	children: (bracket: BracketType, bracketIdx: number) => React.ReactNode;
}) {
	const tournament = useTournament();

	const visibleBrackets = tournament.ctx.settings.bracketProgression.filter(
		(_, i) =>
			!tournament.ctx.isFinalized ||
			!tournament.bracketByIdxOrDefault(i).preview,
	);

	const bracketNameForTab = (name: string) => name.replace("bracket", "");

	return (
		<SendouTabs
			selectedKey={String(bracketIdx)}
			onSelectionChange={(key) => setBracketIdx(Number(key))}
		>
			<SendouTabList>
				{visibleBrackets.map((bracket, i) => (
					<SendouTab key={bracket.name} id={String(i)}>
						{bracketNameForTab(bracket.name)}
					</SendouTab>
				))}
			</SendouTabList>
			{visibleBrackets.map((_, i) => (
				<SendouTabPanel key={i} id={String(i)}>
					{children(tournament.bracketByIdxOrDefault(i), i)}
				</SendouTabPanel>
			))}
		</SendouTabs>
	);
}

function BracketTabContent({
	bracket,
	bracketIdx,
	waitingForTeamsText,
	teamsSourceText,
	formatDateTime,
	formatTime,
}: {
	bracket: BracketType;
	bracketIdx: number;
	waitingForTeamsText: () => string;
	teamsSourceText: () => string | null;
	formatDateTime: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
	formatTime: (date: Date) => string;
}) {
	return (
		<>
			{bracket.enoughTeams ? (
				<Bracket bracket={bracket} bracketIdx={bracketIdx} />
			) : (
				<div>
					<div className="text-center text-lg font-semi-bold text-lighter mt-6">
						{waitingForTeamsText()}
					</div>
					{bracket.sources ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2">
							{teamsSourceText()}
						</div>
					) : null}
					{bracket.requiresCheckIn ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2 text-warning">
							Bracket requires check-in{" "}
							{bracket.startTime ? (
								<span suppressHydrationWarning>
									(open{" "}
									{formatDateTime(sub(bracket.startTime, { hours: 1 }), {
										hour: "numeric",
										minute: "numeric",
										weekday: "long",
									})}{" "}
									- {formatTime(bracket.startTime)})
								</span>
							) : null}
						</div>
					) : null}
				</div>
			)}
		</>
	);
}

function CompactifyButton() {
	const { bracketExpanded, setBracketExpanded } = useBracketExpanded();

	return (
		<SendouButton
			onPress={() => {
				setBracketExpanded(!bracketExpanded);
			}}
			className={styles.compactifyButton}
			icon={bracketExpanded ? <EyeOff /> : <Eye />}
		>
			{bracketExpanded ? "Compactify" : "Show all"}
		</SendouButton>
	);
}

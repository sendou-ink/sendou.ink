import { sub } from "date-fns";
import {
	Check,
	Clipboard,
	Eye,
	EyeOff,
	Map as MapIcon,
	ShieldMinus,
	ShieldPlus,
	Stamp,
	UserPlus,
} from "lucide-react";
import * as React from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import {
	Outlet,
	useLoaderData,
	useLocation,
	useOutletContext,
} from "react-router";
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
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { useUser } from "~/features/auth/core/user";
import { useWebsocketRevalidation } from "~/features/chat/chat-hooks";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	TournamentProvider,
	useTournament,
} from "~/features/tournament/tournament-context";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useHydrated } from "~/hooks/useHydrated";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { SENDOU_INK_BASE_URL } from "~/utils/urls";
import {
	useBracketExpanded,
	useTournamentPreparedMaps,
} from "../../tournament/routes/to.$id";
import { action } from "../actions/to.$id.brackets.server";
import { Bracket } from "../components/Bracket";
import { useBracketSpoilerCensor } from "../components/Bracket/useBracketSpoilerCensor";
import { BracketMapListDialog } from "../components/BracketMapListDialog";
import { TournamentTeamActions } from "../components/TournamentTeamActions";
import * as AbDivisions from "../core/AbDivisions";
import type { Bracket as BracketType } from "../core/Bracket";
import * as PreparedMaps from "../core/PreparedMaps";
import * as Progression from "../core/Progression";
import type { Tournament } from "../core/Tournament";
import {
	loader,
	type TournamentBracketsLoaderData,
} from "../loaders/to.$id.brackets.server";
import { tournamentBracketsSearchParams } from "../tournament-bracket-search-params";
import {
	tournamentBracketWebsocketRoom,
	tournamentWebsocketRoom,
} from "../tournament-bracket-utils";

export { action, loader };

export const handle: SendouRouteHandle = {
	mainBreakout: true,
};

import { tournamentJoinPage } from "~/features/tournament/tournament-urls";
import styles from "./to.$id.brackets.module.css";

export default function TournamentBracketsPage() {
	const data = useLoaderData<TournamentBracketsLoaderData>();
	const layoutTournament = useTournament();

	const tournament = React.useMemo(
		() =>
			data.bracket
				? layoutTournament.withBrackets([data.bracket], {
						participatedUsers: data.participatedUserIds,
						streams: data.streams,
					})
				: layoutTournament,
		[layoutTournament, data.bracket, data.participatedUserIds, data.streams],
	);

	return (
		<TournamentProvider tournament={tournament}>
			<TournamentBracketsView />
		</TournamentProvider>
	);
}

function TournamentBracketsView() {
	const { t } = useTranslation(["common", "tournament"]);
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<TournamentBracketsLoaderData>();
	const ctx = useOutletContext();
	const location = useLocation();

	useScrollToMatchOnLoad();

	const bracket = tournament.bracketByIdx(data.bracketIdx);

	useWebsocketRevalidation(
		tournamentWebsocketRoom(tournament.ctx.id),
		!tournament.ctx.isFinalized,
	);
	// results of the loaded bracket (and group) broadcast to their own room, so that
	// another bracket's or group's live scores do not make this view refetch
	useWebsocketRevalidation(
		tournamentBracketWebsocketRoom({
			tournamentId: tournament.ctx.id,
			bracketIdx: data.bracketIdx,
			groupId: data.groupId,
		}),
		!tournament.ctx.isFinalized,
	);

	const teamProgressStatus = data.teamProgressStatus;
	const showAddSubsButton =
		!tournament.canFinalize(user) &&
		!tournament.everyBracketOver &&
		tournament.hasStarted &&
		tournament.autonomousSubs &&
		teamProgressStatus?.type !== "THANKS_FOR_PLAYING";

	const {
		censored,
		canToggle,
		reveal: revealSpoiler,
		hide: hideSpoiler,
	} = useBracketSpoilerCensor();

	const showTeamActionsRow =
		(!tournament.isLeague && Boolean(teamProgressStatus)) || showAddSubsButton;
	const showSecondaryActionsRow =
		tournament.canFinalize(user) || censored || canToggle;

	const waitingForTeamsText = (bracket: BracketType, bracketIdx: number) => {
		if (bracketIdx > 0) {
			return bracket.requiresCheckIn
				? t("tournament:bracket.waiting.checkin", {
						count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
					})
				: t("tournament:bracket.waiting.advanced", {
						count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
					});
		}

		if (tournament.regularCheckInStartInThePast) {
			return t("tournament:bracket.waiting.checkin", {
				count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
			});
		}

		return t("tournament:bracket.waiting", {
			count: TOURNAMENT.ENOUGH_TEAMS_TO_START,
		});
	};

	const teamsSourceText = (bracket: BracketType) => {
		const progression = tournament.ctx.settings.bracketProgression;
		const sources = progression[bracket.idx].sources;
		if (!sources || sources.length === 0) return null;

		const sourceDescriptions = Progression.sortedSourcesForSeeding(
			sources,
			progression,
		).map((source) => {
			const sourceBracket = progression[source.bracketIdx];

			if (source.placements.length === 0) {
				return t("tournament:bracket.sources.earlyAdvancers", {
					bracket: sourceBracket.name,
					count: sourceBracket.settings?.advanceThreshold,
				});
			}

			if (source.placements.every((placement) => placement < 0)) {
				return t("tournament:bracket.sources.eliminated", {
					bracket: sourceBracket.name,
					count: Math.abs(Math.min(...source.placements)),
				});
			}

			const isTopN =
				!source.rest &&
				Math.min(...source.placements) === 1 &&
				Math.max(...source.placements) === source.placements.length;
			if (isTopN) {
				return t("tournament:bracket.sources.top", {
					bracket: sourceBracket.name,
					count: Math.max(...source.placements),
				});
			}

			return t("tournament:bracket.sources.placements", {
				bracket: sourceBracket.name,
				placements: Progression.placementsToString(
					[...source.placements],
					source.rest,
				),
			});
		});

		return t("tournament:bracket.sources.header", {
			sources: sourceDescriptions.join(", "),
		});
	};

	return (
		<div>
			<Outlet context={ctx} />
			{showTeamActionsRow ? (
				<div className="stack horizontal mb-4 sm justify-between items-center">
					{/** TournamentTeamActions more confusing than helpful for leagues, for example might say "Waiting for match..." when previous match was rescheduled  */}
					{!tournament.isLeague ? (
						<TournamentTeamActions status={teamProgressStatus} />
					) : null}
					{showAddSubsButton ? <AddSubsPopOver /> : null}
				</div>
			) : null}
			{showSecondaryActionsRow ? (
				<div className="stack horizontal sm mb-4">
					{tournament.canFinalize(user) ? (
						<LinkButton
							// keeps the selected bracket, which the loader reads from the search params
							to={{ pathname: "finalize", search: location.search }}
							testId="finalize-tournament-button"
							icon={<Stamp />}
						>
							{t("tournament:actions.finalize.button")}
						</LinkButton>
					) : null}
					{censored ? (
						<SendouButton onPress={revealSpoiler} icon={<ShieldMinus />}>
							{t("common:spoilerFree.showResults")}
						</SendouButton>
					) : canToggle ? (
						<SendouButton onPress={hideSpoiler} icon={<ShieldPlus />}>
							{t("common:spoilerFree.hideResults")}
						</SendouButton>
					) : null}
				</div>
			) : null}
			<BracketTabs
				loadedBracketIdx={data.bracketIdx}
				divisionIdx={data.divisionIdx}
			>
				{bracket ? (
					<BracketTabContent
						bracket={bracket}
						bracketIdx={data.bracketIdx}
						groupId={data.groupId}
						waitingForTeamsText={waitingForTeamsText}
						teamsSourceText={teamsSourceText}
					/>
				) : null}
			</BracketTabs>
		</div>
	);
}

/** Location state accepted by the brackets page (e.g. from the match page's "Back to bracket" link). */
export interface BracketsPageState {
	/** If set, the referenced match is scrolled into view on load. */
	scrollToMatchId?: number;
}

/**
 * Scrolls the match referenced by the navigation `state` into view on load, so
 * returning from a match page lands the user at that match's spot in the bracket
 * instead of the top.
 */
function useScrollToMatchOnLoad() {
	const location = useLocation();
	const scrollToMatchId = (location.state as BracketsPageState | null)
		?.scrollToMatchId;

	useIsomorphicLayoutEffect(() => {
		if (typeof scrollToMatchId !== "number") return;

		document
			.querySelector(`[data-match-id="${scrollToMatchId}"]`)
			?.scrollIntoView({ block: "center", inline: "center" });
	}, [scrollToMatchId]);
}

function getAbDivisionsStartError(
	bracket: BracketType,
	tournament: Tournament,
): string | null {
	if (
		bracket.type !== "round_robin" ||
		!bracket.settings?.hasAbDivisions ||
		!bracket.isStartingBracket ||
		!bracket.seeding ||
		bracket.seeding.length === 0
	) {
		return null;
	}

	const groupCount = new Set(bracket.data.round.map((r) => r.groupId)).size;
	const abDivisionsBySeedOrder = bracket.seeding.map(
		(teamId) => tournament.teamById(teamId)?.abDivision,
	);

	const result = AbDivisions.validate({
		abDivisionsBySeedOrder,
		groupCount,
	});

	return result.ok ? null : result.error;
}

function BracketStarter({
	bracket,
	bracketIdx,
	isDisabled,
}: {
	bracket: BracketType;
	bracketIdx: number;
	isDisabled?: boolean;
}) {
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const isHydrated = useHydrated();

	const close = React.useCallback(() => {
		setDialogOpen(false);
	}, []);

	return (
		<>
			{isHydrated && dialogOpen ? (
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
				isDisabled={isDisabled}
			>
				Start the bracket
			</SendouButton>
		</>
	);
}

function DraftBracketStartPopover() {
	const { t } = useTranslation(["calendar"]);

	return (
		<SendouPopover
			popoverClassName="text-xs"
			trigger={
				<SendouButton
					variant="outlined"
					size="small"
					data-testid="finalize-bracket-button"
				>
					Start the bracket
				</SendouButton>
			}
		>
			{t("calendar:forms.draftBracketStartBlocked")}
		</SendouPopover>
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
	const isHydrated = useHydrated();
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
			{isHydrated && dialogOpen ? (
				<BracketMapListDialog
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					isPreparing
				/>
			) : null}
			<div className="stack sm horizontal ml-auto">
				{hasPreparedMaps ? (
					<Check
						className="color-success w-6"
						data-testid="prepared-maps-check-icon"
					/>
				) : null}
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
	const { copyToClipboard, copySuccess } = useCopyToClipboard();
	const tournament = useTournament();
	const user = useUser();
	const data = useLoaderData<TournamentBracketsLoaderData>();

	const ownedTeam = tournament.ownedTeamByUser(user);
	if (!ownedTeam || !data.ownTeamInviteCode) {
		const teamMemberOf = tournament.teamMemberOfByUser(user);
		if (!teamMemberOf) return null;

		return <SubsPopover>Only team captain or a TO can add subs</SubsPopover>;
	}

	const subsAvailableToAdd =
		tournament.maxMembersPerTeam - ownedTeam.memberUserIds.length;

	const inviteLink = `${SENDOU_INK_BASE_URL}${tournamentJoinPage({
		tournamentId: tournament.ctx.id,
		inviteCode: data.ownTeamInviteCode,
	})}`;

	return (
		<SubsPopover>
			{t("tournament:actions.sub.prompt", { count: subsAvailableToAdd })}
			{subsAvailableToAdd > 0 ? (
				<>
					<Divider className="my-2" />
					<div>{t("tournament:actions.shareLink", { inviteLink })}</div>
					<div className="mt-2 flex justify-center">
						<SendouButton
							size="small"
							icon={copySuccess ? <Check /> : <Clipboard />}
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
					icon={<UserPlus />}
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

/**
 * Bracket switcher. Only the bracket the loader shipped the match data of is rendered;
 * switching navigates so that the newly selected bracket's data gets loaded, the
 * previously loaded bracket staying up until it arrives. Of a league only the brackets
 * of the division the loader resolved can be switched between.
 */
function BracketTabs({
	loadedBracketIdx,
	divisionIdx,
	children,
}: {
	loadedBracketIdx: number;
	divisionIdx: number | null;
	children: React.ReactNode;
}) {
	const tournament = useTournament();
	const [, setIdxParam] = useSearchParam(tournamentBracketsSearchParams, "idx");

	const visibleBrackets = tournament.visibleBracketsMetaOfDivision(divisionIdx);

	const bracketNameForTab = (name: string) => name.replace("bracket", "");

	return (
		<SendouTabs
			selectedKey={String(loadedBracketIdx)}
			onSelectionChange={(key) => setIdxParam(Number(key))}
		>
			<SendouTabList>
				{visibleBrackets.map((bracket) => (
					<SendouTab
						key={bracket.name}
						id={String(bracket.idx)}
						number={tournament.teamsCountOfBracket(bracket.idx)}
					>
						{bracketNameForTab(bracket.name)}
					</SendouTab>
				))}
			</SendouTabList>
			{visibleBrackets.map((bracket) => (
				<SendouTabPanel key={bracket.idx} id={String(bracket.idx)}>
					{children}
				</SendouTabPanel>
			))}
		</SendouTabs>
	);
}

function BracketTabContent({
	bracket,
	bracketIdx,
	groupId,
	waitingForTeamsText,
	teamsSourceText,
}: {
	bracket: BracketType;
	bracketIdx: number;
	groupId: number | null;
	waitingForTeamsText: (bracket: BracketType, bracketIdx: number) => string;
	teamsSourceText: (bracket: BracketType) => string | null;
}) {
	const tournament = useTournament();

	return (
		<>
			<AbDivisionsImbalanceAlert bracket={bracket} />
			<PrepareMapsButton bracket={bracket} bracketIdx={bracketIdx} />
			{tournament.bracketsMeta[bracketIdx].enoughTeams ? (
				<>
					{bracket.type !== "round_robin" && !bracket.preview ? (
						<div className="stack horizontal sm mb-4">
							<CompactifyButton />
						</div>
					) : null}
					<StartBracketAlert bracket={bracket} bracketIdx={bracketIdx} />
					<Bracket
						bracket={bracket}
						bracketIdx={bracketIdx}
						groupId={groupId}
					/>
				</>
			) : (
				<div>
					<div className="text-center text-lg font-semi-bold text-lighter mt-6">
						{waitingForTeamsText(bracket, bracketIdx)}
					</div>
					{bracket.sources ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2">
							{teamsSourceText(bracket)}
						</div>
					) : null}
					{bracket.requiresCheckIn ? (
						<div className="text-center text-sm font-semi-bold text-lighter mt-2 text-warning">
							Bracket requires check-in{" "}
							{bracket.startTime ? (
								<span>
									(open{" "}
									<LocaleTimeRange
										from={sub(bracket.startTime, { hours: 1 })}
										to={bracket.startTime}
										options={{
											hour: "numeric",
											minute: "numeric",
											weekday: "long",
										}}
										inline
									/>
									)
								</span>
							) : null}
						</div>
					) : null}
				</div>
			)}
		</>
	);
}

function PrepareMapsButton({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const tournament = useTournament();
	const user = useUser();
	const isHydrated = useHydrated();

	if (
		!tournament.isOrganizer(user) ||
		bracket.canBeStarted ||
		!bracket.preview ||
		!isHydrated
	) {
		return null;
	}

	return (
		<div className="stack horizontal sm mb-4">
			{/* Error Boundary because preparing maps is optional, so no need to make the whole page inaccessible if it fails */}
			<ErrorBoundary fallback={null}>
				<MapPreparer bracket={bracket} bracketIdx={bracketIdx} />
			</ErrorBoundary>
		</div>
	);
}

function AbDivisionsImbalanceAlert({ bracket }: { bracket: BracketType }) {
	const tournament = useTournament();
	const user = useUser();

	if (
		!bracket.preview ||
		!tournament.isOrganizer(user) ||
		!tournament.regularCheckInHasEnded
	) {
		return null;
	}

	const abDivisionsStartError = getAbDivisionsStartError(bracket, tournament);
	if (!abDivisionsStartError) {
		return null;
	}

	return (
		<div className="stack items-center mb-4">
			<Alert variation="WARNING">
				<div data-testid="ab-divisions-imbalance-alert">
					{abDivisionsStartError}
				</div>
			</Alert>
		</div>
	);
}

function StartBracketAlert({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
}) {
	const tournament = useTournament();
	const user = useUser();

	if (
		!bracket.preview ||
		!tournament.isOrganizer(user) ||
		!tournament.regularCheckInStartInThePast
	) {
		return null;
	}

	const abDivisionsStartError = getAbDivisionsStartError(bracket, tournament);
	const totalTeamsAvailableForTheBracket =
		tournament.eligibleTeamsCountOfBracket(bracketIdx);

	return (
		<div className="stack items-center mb-4">
			<div className="stack sm items-center">
				<Alert
					variation="INFO"
					textClassName="stack horizontal md items-center"
				>
					{bracket.participantTournamentTeamIds.length}/
					{totalTeamsAvailableForTheBracket} teams checked in
					{bracket.canBeStarted ? (
						tournament.isDraft ? (
							<DraftBracketStartPopover />
						) : (
							<BracketStarter
								bracket={bracket}
								bracketIdx={bracketIdx}
								isDisabled={Boolean(abDivisionsStartError)}
							/>
						)
					) : null}
				</Alert>
				{!bracket.canBeStarted ? (
					<div className={styles.miniAlert}>
						⚠️{" "}
						{bracket.isStartingBracket
							? "Tournament start time is in the future"
							: bracket.startTime && bracket.startTime > new Date()
								? "Bracket start time is in the future"
								: "Teams pending from the source brackets"}{" "}
						(blocks starting)
					</div>
				) : null}
			</div>
		</div>
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

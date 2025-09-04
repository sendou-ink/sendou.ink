import { Outlet, useOutletContext, useRevalidator } from "@remix-run/react";
import clsx from "clsx";
import { sub } from "date-fns";
import * as React from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { SendouPopover } from "~/components/elements/Popover";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { EyeIcon } from "~/components/icons/Eye";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { MapIcon } from "~/components/icons/Map";
import { useUser } from "~/features/auth/core/user";
import { useWebsocketRevalidation } from "~/features/chat/chat-hooks";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { tournamentWebsocketRoom } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
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

import "../tournament-bracket.css";
import "../components/Bracket/bracket.css";

export default function TournamentBracketsPage() {
	const { t } = useTranslation(["tournament"]);
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

	const showAddSubsButton =
		!tournament.canFinalize(user) &&
		!tournament.everyBracketOver &&
		tournament.hasStarted &&
		tournament.autonomousSubs;

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
				<div className="tournament-bracket__finalize">
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
							alertClassName="tournament-bracket__start-bracket-alert"
							textClassName="stack horizontal md items-center"
						>
							{bracket.participantTournamentTeamIds.length}/
							{totalTeamsAvailableForTheBracket()} teams checked in
							{bracket.canBeStarted ? (
								<BracketStarter bracket={bracket} bracketIdx={bracketIdx} />
							) : null}
						</Alert>
						{!bracket.canBeStarted ? (
							<div className="tournament-bracket__mini-alert">
								⚠️{" "}
								{bracketIdx === 0
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
				{showAddSubsButton ? (
					// TODO: could also hide this when team is not in any bracket anymore
					<AddSubsPopOver />
				) : null}
			</div>
			<div className="stack md">
				<div className="stack horizontal sm">
					<BracketNav bracketIdx={bracketIdx} setBracketIdx={setBracketIdx} />
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
				{bracket.enoughTeams ? (
					<Bracket bracket={bracket} bracketIdx={bracketIdx} />
				) : null}
			</div>
			{!bracket.enoughTeams ? (
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
									{sub(bracket.startTime, { hours: 1 }).toLocaleString(
										"en-US",
										{
											hour: "numeric",
											minute: "numeric",
											weekday: "long",
										},
									)}{" "}
									-{" "}
									{bracket.startTime.toLocaleTimeString("en-US", {
										hour: "numeric",
										minute: "numeric",
									})}
									)
								</span>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
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
			{isMounted ? (
				<BracketMapListDialog
					isOpen={dialogOpen}
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					key={bracketIdx}
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
			{isMounted ? (
				<BracketMapListDialog
					isOpen={dialogOpen}
					close={close}
					bracket={bracket}
					bracketIdx={bracketIdx}
					isPreparing
					key={bracketIdx}
				/>
			) : null}
			<div className="stack sm horizontal ml-auto">
				{hasPreparedMaps ? (
					<CheckmarkIcon
						className="fill-success w-6"
						testId="prepared-maps-check-icon"
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
		tournament.maxTeamMemberCount - ownedTeam.members.length;

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

function BracketNav({
	bracketIdx,
	setBracketIdx,
}: {
	bracketIdx: number;
	setBracketIdx: (bracketIdx: number) => void;
}) {
	const tournament = useTournament();

	const shouldRender = () => {
		const brackets = tournament.ctx.isFinalized
			? tournament.brackets.filter((b) => !b.preview)
			: tournament.ctx.settings.bracketProgression;

		return brackets.length > 1;
	};

	if (!shouldRender()) return null;

	const visibleBrackets = tournament.ctx.settings.bracketProgression.filter(
		// an underground bracket was never played despite being in the format
		(_, i) =>
			!tournament.ctx.isFinalized ||
			!tournament.bracketByIdxOrDefault(i).preview,
	);

	const bracketNameForButton = (name: string) => name.replace("bracket", "");

	return (
		<>
			{/** MOBILE */}
			<SendouMenu
				trigger={
					<SendouButton
						className={clsx(
							"tournament-bracket__bracket-nav__link",
							"tournament-bracket__menu",
						)}
					>
						{bracketNameForButton(
							tournament.bracketByIdxOrDefault(bracketIdx).name,
						)}
						<span className="tournament-bracket__bracket-nav__chevron">▼</span>
					</SendouButton>
				}
			>
				{visibleBrackets.map((bracket, i) => (
					<SendouMenuItem
						key={bracket.name}
						onAction={() => setBracketIdx(i)}
						isActive={i === bracketIdx}
					>
						{bracketNameForButton(bracket.name)}
					</SendouMenuItem>
				))}
			</SendouMenu>
			{/** DESKTOP */}
			<div className="tournament-bracket__bracket-nav tournament-bracket__button-row">
				{visibleBrackets.map((bracket, i) => {
					return (
						<SendouButton
							key={bracket.name}
							onPress={() => setBracketIdx(i)}
							className={clsx("tournament-bracket__bracket-nav__link", {
								"tournament-bracket__bracket-nav__link__selected":
									bracketIdx === i,
							})}
						>
							{bracketNameForButton(bracket.name)}
						</SendouButton>
					);
				})}
			</div>
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
			className="tournament-bracket__compactify-button"
			icon={bracketExpanded ? <EyeSlashIcon /> : <EyeIcon />}
		>
			{bracketExpanded ? "Compactify" : "Show all"}
		</SendouButton>
	);
}

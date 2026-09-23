import clsx from "clsx";
import { Check, Lock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { LocaleTime } from "~/components/LocaleTime";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { matchPageSearchParams } from "~/components/match-page/match-page-search-params";
import { useUser } from "~/features/auth/core/user";
import type {
	PlayableWindowTier,
	WindowSchedule,
} from "~/features/availability/availability-types";
import {
	PlayableWindowsSummary,
	TierDot,
} from "~/features/availability/components/PlayableWindowsSummary";
import {
	AvailabilityMemberRow,
	type AvailabilityPanelUser,
	AvailabilitySummary,
	availabilityRowStatus,
} from "~/features/availability/components/RegistrationAvailabilityPanel";
import * as Availability from "~/features/availability/core/Availability";
import { useTournament } from "~/features/tournament/tournament-context";
import { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { SendouForm } from "~/form/SendouForm";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useSearchParam } from "~/modules/search-params/hooks";
import { databaseTimestampToDate, getDateAtNextFullHour } from "~/utils/dates";
import * as LeagueScheduling from "../core/LeagueScheduling";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { type MatchPageTeam, useMatch } from "../match-page-context";
import { proposeLeagueTimesSchema } from "../tournament-match-schemas";
import styles from "./TournamentMatchScheduleTab.module.css";

const CANDIDATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
	weekday: "short",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

type Schedule = TournamentMatchLoaderData["schedule"];
type Proposal = Schedule["proposals"][number];

/**
 * Where the two teams agree on when the set is played: each side's candidate times, of which only
 * the other side's can be picked, and how the candidates fit the viewer's own roster.
 */
export function TournamentMatchScheduleTab({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const user = useUser();
	const {
		teams: [teamOne, teamTwo],
		ownTeamId,
	} = useMatch();
	const { schedule } = data;

	if (!teamOne || !teamTwo) return null;

	const isOrganizer = tournament.isOrganizer(user);
	const isScheduled =
		schedule.phase === "SCHEDULED" || schedule.phase === "SCHEDULED_LOCKED";
	const boardClosed = schedule.scheduleSetByOrganizer;

	const playableWindows = schedule.availability
		? Availability.playableWindows({
				members: schedule.availability.members,
				minPlayers: schedule.availability.minPlayers,
			})
		: null;
	const candidateTier = (proposedAt: number): PlayableWindowTier | null => {
		if (!playableWindows) return null;

		const set = LeagueScheduling.busyBlock(proposedAt);
		const covering = playableWindows.filter(
			(window) =>
				window.startsAt <= set.startsAt && window.endsAt >= set.endsAt,
		);
		if (covering.some((window) => window.tier === "FULL")) return "FULL";
		if (covering.length > 0) return "ONE_SHORT";
		return null;
	};

	// the viewer's own team first, so their candidates are the left column
	const orderedTeams =
		ownTeamId === teamTwo.id ? [teamTwo, teamOne] : [teamOne, teamTwo];

	return (
		<SendouTabPanel id={TAB_KEYS.SCHEDULE}>
			<div className={styles.root} data-testid="schedule-tab">
				{isScheduled && schedule.scheduledAt ? (
					<div className={styles.agreedTime} data-testid="agreed-time">
						<Check size={18} className={styles.agreedTimeIcon} />
						<span>{t("tournament:match.schedule.agreedTime")}</span>
						<LocaleTime
							date={schedule.scheduledAt}
							options={CANDIDATE_TIME_FORMAT}
							className={styles.agreedTimeValue}
							inline
						/>
						{boardClosed ? (
							<span className={styles.setByOrganizer}>
								<Lock size={12} />{" "}
								{t("tournament:match.schedule.setByOrganizer")}
							</span>
						) : null}
					</div>
				) : null}
				{boardClosed ? (
					<Alert variation="INFO" tiny>
						{t("tournament:match.schedule.boardClosed")}
					</Alert>
				) : (
					<>
						{isScheduled ? (
							<div className="text-xs text-lighter">
								{t("tournament:match.schedule.rescheduleInfo")}
							</div>
						) : null}
						<div className={styles.board}>
							{orderedTeams.map((team) => (
								<CandidateColumn
									key={team.id}
									team={team}
									proposals={schedule.proposals.filter(
										(proposal) => proposal.tournamentTeamId === team.id,
									)}
									isOwn={team.id === ownTeamId}
									canPick={
										(ownTeamId !== null && team.id !== ownTeamId) ||
										(isOrganizer && ownTeamId === null)
									}
									canReject={
										isScheduled && ownTeamId !== null && team.id !== ownTeamId
									}
									now={schedule.now}
									candidateTier={candidateTier}
								/>
							))}
						</div>
						{ownTeamId !== null ? (
							<ProposeTimesForm
								isReschedule={isScheduled}
								isPlayableAt={schedule.isPlayableAt}
								ownProposedAts={schedule.proposals
									.filter(
										(proposal) =>
											proposal.tournamentTeamId === ownTeamId &&
											LeagueScheduling.isAcceptableProposal({
												proposedAt: proposal.proposedAt,
												now: schedule.now,
											}),
									)
									.map((proposal) => proposal.proposedAt)}
							/>
						) : null}
					</>
				)}
				{schedule.availability && ownTeamId !== null ? (
					<OwnTeamAvailability
						availability={schedule.availability}
						team={orderedTeams[0]}
						windows={playableWindows ?? []}
					/>
				) : null}
			</div>
		</SendouTabPanel>
	);
}

function CandidateColumn({
	team,
	proposals,
	isOwn,
	canPick,
	canReject,
	now,
	candidateTier,
}: {
	team: MatchPageTeam;
	proposals: Array<Proposal>;
	isOwn: boolean;
	canPick: boolean;
	canReject: boolean;
	now: number;
	candidateTier: (proposedAt: number) => PlayableWindowTier | null;
}) {
	const { t } = useTranslation(["tournament"]);
	const [, setTab] = useSearchParam(matchPageSearchParams, "tab");
	// the tab is the default one only while the set has no time, so acting pins it in the URL
	const stayOnTab = () => setTab(TAB_KEYS.SCHEDULE);
	const { formatter: candidateTimeFormatter } = useDateTimeFormat(
		CANDIDATE_TIME_FORMAT,
	);
	const someCandidateHasTier = proposals.some(
		(proposal) => candidateTier(proposal.proposedAt) !== null,
	);

	return (
		<section
			className={styles.column}
			data-testid={isOwn ? "own-candidates" : "opponent-candidates"}
		>
			<h3 className={styles.columnHeading}>{team.name}</h3>
			{proposals.length === 0 ? (
				<div className="text-xs text-lighter">
					{t("tournament:match.schedule.noCandidates")}
				</div>
			) : (
				<ul className={styles.candidates}>
					{proposals.map((proposal) => {
						const tier = candidateTier(proposal.proposedAt);
						const passed = !LeagueScheduling.isAcceptableProposal({
							proposedAt: proposal.proposedAt,
							now,
						});

						return (
							<li
								key={proposal.id}
								className={clsx(styles.candidate, {
									[styles.candidatePassed]: passed,
								})}
								data-testid="candidate-time"
							>
								{someCandidateHasTier ? (
									<span className={styles.candidateDot}>
										{tier ? <TierDot full={tier === "FULL"} /> : null}
									</span>
								) : null}
								<span className={styles.candidateTime}>
									<LocaleTime
										date={proposal.proposedAt}
										options={CANDIDATE_TIME_FORMAT}
										inline
									/>
								</span>
								{canPick && !passed ? (
									<ActionButton
										schema={matchSchema}
										action="ACCEPT_PROPOSAL"
										fields={{ proposalId: proposal.id }}
										size="small"
										icon={<Check />}
										testId="pick-candidate-button"
										confirm={{
											dialogHeading: t(
												"tournament:match.schedule.pickConfirm",
												{
													time: candidateTimeFormatter.format(
														proposal.proposedAt,
													),
												},
											),
											submitButtonText: t("tournament:match.schedule.pick"),
											submitButtonVariant: "primary",
										}}
										onClick={stayOnTab}
									>
										{t("tournament:match.schedule.pick")}
									</ActionButton>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
			{canReject && proposals.length > 0 ? (
				<ActionButton
					schema={matchSchema}
					action="REJECT_RESCHEDULE"
					variant="minimal-destructive"
					size="small"
					icon={<X />}
					className="mt-2"
					testId="reject-reschedule-button"
					onClick={stayOnTab}
				>
					{t("tournament:match.schedule.keepCurrentTime")}
				</ActionButton>
			) : null}
		</section>
	);
}

function ProposeTimesForm({
	isReschedule,
	isPlayableAt,
	ownProposedAts,
}: {
	isReschedule: boolean;
	isPlayableAt: number | null;
	/** The team's candidates still ahead, which the form starts from and a submit replaces. */
	ownProposedAts: Array<number>;
}) {
	const { t } = useTranslation(["tournament"]);

	const earliest = Math.max(
		getDateAtNextFullHour(new Date()).getTime(),
		isPlayableAt !== null ? databaseTimestampToDate(isPlayableAt).getTime() : 0,
	);
	const hasProposed = ownProposedAts.length > 0;

	// xxx: you can spam propose to spam the chat
	// xxx: remove the green dot after proposing to indicate availability
	return (
		<section className={styles.proposeSection}>
			<h3 className={styles.columnHeading}>
				{isReschedule
					? t("tournament:match.schedule.requestAnotherTime")
					: t("tournament:match.schedule.proposeTimes")}
			</h3>
			<SendouForm
				// remount when the board changes so the form keeps mirroring what the team has up
				key={ownProposedAts.join(",")}
				schema={proposeLeagueTimesSchema}
				defaultValues={{
					times: hasProposed
						? ownProposedAts.map(databaseTimestampToDate)
						: [new Date(earliest)],
				}}
				submitButtonText={
					hasProposed
						? t("tournament:match.schedule.updateTimes")
						: t("tournament:match.schedule.propose")
				}
				submitButtonSize="small"
				submitButtonTestId="propose-times-button"
				fullWidth
			>
				{({ FormField }) => <FormField name="times" />}
			</SendouForm>
		</section>
	);
}

function OwnTeamAvailability({
	availability,
	team,
	windows,
}: {
	availability: NonNullable<Schedule["availability"]>;
	team: MatchPageTeam;
	windows: ReturnType<typeof Availability.playableWindows>;
}) {
	const { t } = useTranslation(["schedule", "tournament"]);
	const { formatter } = useDateTimeFormat(CANDIDATE_TIME_FORMAT);

	const scheduleByUserId = new Map(
		availability.members.map((member) => [member.userId, member]),
	);
	const roster: Array<AvailabilityPanelUser> = team.members.map((member) => ({
		...member,
		id: member.userId,
	}));
	const entryOf = (member: WindowSchedule | undefined) =>
		member
			? {
					userId: member.userId,
					availability: Availability.availabilityInWindow({
						reported: member.reported,
						slots: member.ranges,
						busy: member.busy,
						window: availability.window,
					}),
				}
			: undefined;

	return (
		<section className={styles.availability} data-testid="own-availability">
			<h3 className={styles.columnHeading}>
				{t("tournament:match.schedule.availabilityTitle", { team: team.name })}{" "}
				<span className={styles.windowText}>
					{formatter.formatRange(
						availability.window.startsAt,
						availability.window.endsAt,
					)}
				</span>
			</h3>
			<ul className={styles.rows}>
				{roster.map((member) => (
					<AvailabilityMemberRow
						key={member.id}
						user={member}
						entry={entryOf(scheduleByUserId.get(member.id))}
					/>
				))}
			</ul>
			<AvailabilitySummary
				statuses={roster.map((member) =>
					availabilityRowStatus(entryOf(scheduleByUserId.get(member.id))),
				)}
			/>
			<PlayableWindowsSummary
				windows={windows}
				minPlayers={availability.minPlayers}
			/>
		</section>
	);
}

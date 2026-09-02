import clsx from "clsx";
import { AlertCircle, Check, UserRound, UsersRound, X } from "lucide-react";
import * as React from "react";
import { Text } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { InviteLinkInput } from "~/components/InviteLinkInput";
import { containerClassName } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { Config } from "~/config";
import { useUser } from "~/features/auth/core/user";
import {
	AvailabilityMemberRow,
	type AvailabilityPanelEntry,
	AvailabilityRowDetail,
	type AvailabilityRowStatus,
	AvailabilityStatusDots,
	AvailabilitySummary,
	AvailabilityWindowText,
	availabilityRowStatus,
	RegistrationAvailabilityPanel,
} from "~/features/availability/components/RegistrationAvailabilityPanel";
import type {
	MemberRole,
	MemberRoleType,
} from "~/features/team/team-constants";
import { getMemberRoleType } from "~/features/team/team-utils";
import { timezoneMiddleware } from "~/features/timezone/timezone-middleware.server";
import {
	type CounterPickMapPool,
	CounterPickMapPoolPicker,
	MapPoolValidationStatusMessage,
	useCounterPickMapPoolValidationStatus,
} from "~/features/tournament/components/CounterPickMapPoolPicker";
import { useTournament } from "~/features/tournament/tournament-context";
import { tournamentJoinPage } from "~/features/tournament/tournament-urls";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import { LUTI_ORGANIZATION_ID } from "~/features/tournament-organization/tournament-organization-constants";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	LOG_IN_URL,
	SENDOU_INK_BASE_URL,
	userEditProfilePage,
} from "~/utils/urls";
import { action } from "../actions/to.$id.register.server";
import type { TournamentRegisterPageLoader } from "../loaders/to.$id.register.server";
import { loader } from "../loaders/to.$id.register.server";
import {
	type RegisterTeamFormValues,
	registerTeamFormSchema,
} from "../tournament-register-schemas";
import {
	addPlayerSchema,
	addTeamPlayersSchema,
	checkInSchema,
	updateMapPoolSchema,
} from "../tournament-schemas";
import type { Route } from "./+types/to.$id.register";
import styles from "./to.$id.register.module.css";

export { action, loader };

const QUICK_ADD_STATUS_ORDER: Record<AvailabilityRowStatus, number> = {
	available: 0,
	partial: 1,
	unknown: 2,
	hidden: 3,
	busy: 4,
	unavailable: 5,
};

interface QuickAddPlayer {
	id: number;
	username: string;
	teamId: number | null;
	role: MemberRole | null;
	roleType: MemberRoleType | null;
}

export const middleware: Route.MiddlewareFunction[] = [timezoneMiddleware];

export const handle: SendouRouteHandle = {
	i18n: ["schedule"],
};

export default function TournamentRegisterPage() {
	const user = useUser();
	const tournament = useTournament();
	const { t } = useTranslation(["tournament"]);

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	const teamOwned = tournament.ownedTeamByUser(user);
	const isRegularMemberOfATeam = teamMemberOf && !teamOwned;
	const registrationClosedForNonParticipant =
		!tournament.registrationOpen && !teamMemberOf;

	const showAddIGNAlert =
		tournament.ctx.settings.requireInGameNames &&
		!teamOwned &&
		user &&
		!user?.inGameName;

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{isRegularMemberOfATeam ? (
				<div className="stack md">
					<Alert>{t("tournament:pre.captainOnlyEdit")}</Alert>
					<div className="stack md items-center">
						<LeaveTeamControl />
					</div>
					<RegistrationForms readOnly />
				</div>
			) : registrationClosedForNonParticipant ? (
				<Alert>{t("tournament:pre.registrationClosed")}</Alert>
			) : showAddIGNAlert ? (
				<div>
					<Alert variation="WARNING">
						<div className="stack horizontal sm items-center flex-wrap justify-center text-center">
							{t("tournament:ign.required")}{" "}
							<LinkButton to={userEditProfilePage(user)} size="small">
								{t("tournament:ign.editProfile")}
							</LinkButton>
						</div>
					</Alert>
				</div>
			) : (
				<RegistrationForms />
			)}
		</div>
	);
}

function LeaveTeamControl() {
	const { t } = useTranslation(["tournament", "common"]);
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const user = useUser();
	const tournament = useTournament();

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	if (!user || !teamMemberOf) return null;

	const checkedIn = teamMemberOf.checkIns.length > 0;
	const organizerAdded = Boolean(
		data?.ownTeam?.members.some(
			(member) => member.userId === user.id && member.isOrganizerAdded,
		),
	);
	const cannotLeave =
		organizerAdded || checkedIn || !tournament.registrationOpen;

	if (cannotLeave) {
		return (
			<SendouPopover
				trigger={
					<SendouButton className="small-text" variant="minimal-destructive">
						{t("tournament:pre.leave.button")}
					</SendouButton>
				}
			>
				{organizerAdded
					? t("tournament:pre.leave.cant.organizerAdded")
					: checkedIn
						? t("tournament:pre.leave.cant.checkedIn")
						: t("tournament:pre.leave.cant.registrationClosed")}
			</SendouPopover>
		);
	}

	return (
		<FormWithConfirm
			dialogHeading={t("tournament:pre.leave.confirm", {
				teamName: teamMemberOf.name,
			})}
			fields={[["_action", "LEAVE_TEAM"]]}
			submitButtonText={t("common:actions.leave")}
		>
			<SendouButton
				className="small-text"
				variant="minimal-destructive"
				type="submit"
			>
				{t("tournament:pre.leave.button")}
			</SendouButton>
		</FormWithConfirm>
	);
}

function PleaseLogIn() {
	const { t } = useTranslation(["tournament"]);

	return (
		<form className="stack items-center mt-4" action={LOG_IN_URL} method="post">
			<SendouButton size="big" type="submit">
				{t("tournament:pre.logIn")}
			</SendouButton>
		</form>
	);
}

function RegistrationForms({ readOnly = false }: { readOnly?: boolean }) {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const user = useUser();
	const tournament = useTournament();

	if (readOnly) {
		return <ReadOnlyRegistrationForms />;
	}

	const ownTeam = tournament.ownedTeamByUser(user)
		? (data?.ownTeam ?? null)
		: null;
	const ownTeamCheckedIn = Boolean(ownTeam && ownTeam.checkIns.length > 0);
	const hasFriendCodeSet = Boolean(user?.friendCode);

	if (!user) {
		return <PleaseLogIn />;
	}

	const showRegisterNewTeam = () => {
		if (ownTeam) return true;
		if (!tournament.registrationOpen) return false;

		return !tournament.regularCheckInHasEnded;
	};

	return (
		<div className="stack lg">
			{showRegisterNewTeam() ? <FriendCode /> : null}
			{hasFriendCodeSet ? (
				<RegistrationProgress
					checkedIn={ownTeamCheckedIn}
					name={ownTeam?.name}
					mapPool={data?.mapPool ?? undefined}
					members={ownTeam?.members}
				/>
			) : null}
			{showRegisterNewTeam() && hasFriendCodeSet ? (
				<TeamInfo
					ownTeam={ownTeam}
					canUnregister={Boolean(
						ownTeam && !ownTeamCheckedIn && !tournament.isInvitational,
					)}
				/>
			) : null}
			{tournament.isLeague &&
			tournament.ctx.organization?.id === LUTI_ORGANIZATION_ID ? (
				<GoogleFormsLink />
			) : null}
			{ownTeam && hasFriendCodeSet ? (
				<>
					<FillRoster ownTeam={ownTeam} ownTeamCheckedIn={ownTeamCheckedIn} />
					{tournament.teamsPrePickMaps ? (
						<TeamCounterPickMapPoolPicker key={tournament.ctx.id} />
					) : null}
				</>
			) : null}
		</div>
	);
}

function ReadOnlyRegistrationForms() {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const tournament = useTournament();

	const team = data?.ownTeam;
	if (!team) return null;

	const checkedIn = team.checkIns.length > 0;

	return (
		<div className="stack lg">
			<RegistrationProgress
				checkedIn={checkedIn}
				name={team.name}
				mapPool={team.mapPool ?? undefined}
				members={team.members}
			/>
			<TeamInfo ownTeam={team} canUnregister={false} readOnly />
			<FillRoster ownTeam={team} ownTeamCheckedIn={checkedIn} readOnly />
			{tournament.teamsPrePickMaps ? (
				<TeamCounterPickMapPoolPicker readOnly mapPool={team.mapPool ?? []} />
			) : null}
		</div>
	);
}

function RegistrationProgress({
	checkedIn,
	name,
	members,
	mapPool,
}: {
	checkedIn?: boolean;
	name?: string;
	members?: unknown[];
	mapPool?: unknown[];
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const { formatter: registrationClosesFormatter } = useDateTimeFormat({
		minute: "numeric",
		hour: "numeric",
		day: "numeric",
		month: "numeric",
	});

	const completedIfTruthy = (condition: unknown) =>
		condition ? "completed" : "incomplete";

	const steps = [
		{
			name: t("tournament:pre.steps.name"),
			status: completedIfTruthy(name),
		},
		{
			name: t("tournament:pre.steps.roster"),
			status: completedIfTruthy(
				members && members.length >= tournament.minMembersPerTeam,
			),
		},
		tournament.teamsPrePickMaps
			? {
					name: t("tournament:pre.steps.pool"),
					status: completedIfTruthy(mapPool && mapPool.length > 0),
				}
			: null,
		!tournament.isLeague
			? {
					name: t("tournament:pre.steps.check-in"),
					status: completedIfTruthy(checkedIn),
				}
			: null,
		tournament.isLeague
			? {
					name: t("tournament:pre.steps.googleSheet"),
					status: "notice" as const,
				}
			: null,
	].filter((step) => step !== null);

	const regClosesBeforeStart =
		tournament.registrationClosesAt.getTime() !==
		tournament.ctx.startsAt.getTime();

	const registrationClosesAtString =
		registrationClosesFormatter.format(
			tournament.isLeague
				? tournament.ctx.startsAt
				: tournament.registrationClosesAt,
		) ?? "";

	return (
		<div>
			<h3 className={clsx(styles.sectionHeader, "text-center")}>
				{t("tournament:pre.steps.header")}
			</h3>
			<section className={clsx(styles.section, "stack md")}>
				<div className="stack horizontal lg justify-center text-sm font-semi-bold">
					{steps.map((step, i) => {
						return (
							<div
								key={step.name}
								className="stack sm items-center text-center"
							>
								{step.name}
								{step.status === "completed" ? (
									<Check
										className="color-success"
										data-testid={`checkmark-icon-num-${i + 1}`}
									/>
								) : step.status === "notice" ? (
									<AlertCircle className="color-info" />
								) : (
									<X className="color-error" />
								)}
							</div>
						);
					})}
				</div>
				{!tournament.isLeague ? (
					<CheckIn
						canCheckIn={
							steps.filter((step) => step.status === "incomplete").length === 1
						}
						startDate={tournament.regularCheckInStartsAt}
						endDate={tournament.regularCheckInEndsAt}
						checkedIn={checkedIn}
					/>
				) : null}
			</section>
			<div className={styles.sectionWarning}>
				{regClosesBeforeStart || tournament.isLeague ? (
					<span className="text-warning">
						{t("tournament:pre.registrationClosesAt", {
							time: registrationClosesAtString,
						})}
					</span>
				) : (
					t("tournament:pre.footer")
				)}
			</div>
		</div>
	);
}

function CheckIn({
	canCheckIn,
	startDate,
	endDate,
	checkedIn,
}: {
	canCheckIn: boolean;
	startDate: Date;
	endDate: Date;
	checkedIn?: boolean;
}) {
	const { t } = useTranslation(["tournament"]);
	const isHydrated = useHydrated();
	const { formatter: checkInFormatter } = useDateTimeFormat({
		minute: "numeric",
		hour: "numeric",
		day: "2-digit",
		month: "2-digit",
	});

	const now = useAutoRerender();
	const status: "OVER" | "OPEN" | "UPCOMING" =
		now > endDate ? "OVER" : now >= startDate ? "OPEN" : "UPCOMING";

	const checkInStartsString = checkInFormatter.format(startDate) ?? "";
	const checkInEndsString = checkInFormatter.format(endDate) ?? "";

	if (status === "UPCOMING") {
		return (
			<div className={clsx("text-center text-xs", { invisible: !isHydrated })}>
				{t("tournament:pre.checkIn.range", {
					start: checkInStartsString,
					finish: checkInEndsString,
				})}
			</div>
		);
	}

	if (checkedIn) {
		return (
			<div className="text-center text-xs">
				{t("tournament:pre.checkIn.checkedIn")}
			</div>
		);
	}

	if (status === "OVER") {
		return (
			<div className="text-center text-xs">
				{t("tournament:pre.checkIn.over")}
			</div>
		);
	}

	if (!canCheckIn) {
		return (
			<div className="stack items-center">
				<SendouPopover
					trigger={
						<SendouButton size="small">
							{t("tournament:pre.checkIn.button")}
						</SendouButton>
					}
				>
					{t("tournament:pre.checkIn.cant")}
				</SendouPopover>
			</div>
		);
	}

	return (
		<ActionButton
			schema={checkInSchema}
			action="CHECK_IN"
			formClassName="stack items-center"
			size="small"
			testId="check-in-button"
		>
			{t("tournament:pre.checkIn.button")}
		</ActionButton>
	);
}

function TeamInfo({
	ownTeam,
	canUnregister,
	readOnly = false,
}: {
	ownTeam?: TournamentTeamFull | null;
	canUnregister: boolean;
	readOnly?: boolean;
}) {
	const { t } = useTranslation(["tournament", "common"]);
	const tournament = useTournament();

	const defaultValues: Partial<RegisterTeamFormValues> = {
		teamId: readOnly ? null : ownTeam?.team ? String(ownTeam.team.id) : null,
		pickUpName: readOnly
			? (ownTeam?.name ?? "")
			: ownTeam?.team
				? null
				: (ownTeam?.name ?? ""),
		logo:
			!ownTeam?.team &&
			ownTeam?.pickupAvatarUrl &&
			typeof ownTeam?.avatarImgId === "number"
				? {
						type: "EXISTING",
						imgId: ownTeam.avatarImgId,
						url: ownTeam.pickupAvatarUrl,
					}
				: null,
		prefersNotToHost: Boolean(ownTeam?.prefersNotToHost),
	};

	return (
		<div>
			<div className="stack horizontal justify-between">
				<h3 className={styles.sectionHeader}>
					1. {t("tournament:pre.info.header")}
				</h3>
				{canUnregister &&
				tournament.isLeague &&
				!tournament.registrationOpen ? (
					<SendouPopover
						trigger={
							<SendouButton
								size="small"
								variant="minimal-destructive"
								className="small-text"
							>
								{t("tournament:pre.info.unregister")}
							</SendouButton>
						}
					>
						{t("tournament:pre.info.unregister.league")}
					</SendouPopover>
				) : canUnregister ? (
					<FormWithConfirm
						dialogHeading={t("tournament:pre.info.unregister.confirm")}
						submitButtonText={t("tournament:pre.info.unregister")}
						fields={[["_action", "UNREGISTER"]]}
					>
						<SendouButton
							className="small-text"
							variant="minimal-destructive"
							size="small"
						>
							{t("tournament:pre.info.unregister")}
						</SendouButton>
					</FormWithConfirm>
				) : null}
			</div>
			<section className={styles.section}>
				<SendouForm
					schema={registerTeamFormSchema}
					defaultValues={defaultValues}
					className={clsx("stack md", styles.sectionForm)}
					submitButtonText={t("common:actions.save")}
					submitButtonTestId="save-team-button"
					readOnly={readOnly}
				>
					<RegisterTeamFields readOnly={readOnly} />
				</SendouForm>
			</section>
		</div>
	);
}

function RegisterTeamFields({ readOnly = false }: { readOnly?: boolean }) {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const tournament = useTournament();
	const { values } = useFormFieldContext();

	if (readOnly) {
		return (
			<>
				<FormField name="pickUpName" />
				<FormField name="logo" />
				<FormField name="prefersNotToHost" />
			</>
		);
	}

	const isLinked = Boolean(values.teamId);

	const entryByUserId = availabilityEntryByUserId(data);

	const teamOptions = (data?.teams ?? []).map((team) => {
		const statuses = (
			entryByUserId
				? teamMemberStatuses({ data, teamId: team.id, entryByUserId })
				: []
		).filter((status) => status === "available" || status === "partial");

		return {
			value: String(team.id),
			label: team.name,
			description:
				statuses.length > 0 ? (
					<span className={styles.teamOptionAvailability}>
						<AvailabilityStatusDots statuses={statuses} />
						<AvailabilitySummary statuses={statuses} />
					</span>
				) : undefined,
		};
	});
	const showTeamSelect = teamOptions.length > 0 && tournament.registrationOpen;

	return (
		<>
			{showTeamSelect ? (
				<FormField name="teamId" options={teamOptions} />
			) : null}
			{!data?.ownTeam ? <SelectedTeamAvailability /> : null}
			{!isLinked ? (
				<>
					<FormField
						name="pickUpName"
						disabled={!tournament.registrationOpen}
					/>
					<FormField name="logo" />
				</>
			) : null}
			<FormField name="prefersNotToHost" />
		</>
	);
}

function FriendCode() {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();

	if (!user?.friendCode) {
		return (
			<div className="stack items-center">
				<FriendCodePopover size="small" />
				<div className={clsx(styles.sectionWarning, "mt-2")}>
					{t("tournament:pre.friendCode.needed")}
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-end">
			<FriendCodePopover size="small" />
		</div>
	);
}

function GoogleFormsLink() {
	const { t } = useTranslation(["tournament"]);

	return (
		<div>
			<h3 className={styles.sectionHeader}>
				{t("tournament:pre.googleForm.header")}
			</h3>
			<section className={clsx(styles.section, "stack lg items-center")}>
				<a
					href={Config.leagueGoogleFormUrl}
					className="py-4 font-bold"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t("tournament:pre.googleForm.link")}
				</a>
			</section>
			<div className={styles.sectionWarning}>
				{t("tournament:pre.googleForm.footer")}
			</div>
		</div>
	);
}

function FillRoster({
	ownTeam,
	ownTeamCheckedIn,
	readOnly = false,
}: {
	ownTeam: TournamentTeamFull;
	ownTeamCheckedIn: boolean;
	readOnly?: boolean;
}) {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const tournament = useTournament();
	const { t } = useTranslation(["common", "tournament", "schedule"]);
	const { formatter: dateFormatter } = useDateTimeFormat({
		month: "long",
		day: "numeric",
	});

	const inviteLink = `${SENDOU_INK_BASE_URL}${tournamentJoinPage({
		tournamentId: tournament.ctx.id,
		inviteCode: ownTeam.inviteCode!,
	})}`;

	const ownTeamMembers = ownTeam.members;

	const missingMembers = Math.max(
		tournament.minMembersPerTeam - ownTeamMembers.length,
		0,
	);

	const optionalMembers = Math.max(
		tournament.maxMembersPerTeam - ownTeamMembers.length - missingMembers,
		0,
	);

	const canRemoveMembers =
		!readOnly &&
		!tournament.isInvitational &&
		((!ownTeamCheckedIn && ownTeamMembers.length > 1) ||
			(ownTeamCheckedIn &&
				ownTeamMembers.length > tournament.minMembersPerTeam));

	const quickAddPlayers = (() => {
		if (readOnly) return [];
		return (data?.friendPlayers?.friends ?? []).filter((user) => {
			const isNotInTeam = tournament.ctx.teams.every(
				(team) => !team.memberUserIds.includes(user.id),
			);

			const hasInGameNameIfNeeded =
				!tournament.ctx.settings.requireInGameNames || user.inGameName;

			return isNotInTeam && hasInGameNameIfNeeded;
		});
	})();

	const teamIsFull = ownTeamMembers.length >= tournament.maxMembersPerTeam;
	const canAddMembers = !teamIsFull && tournament.registrationOpen && !readOnly;

	const availability = data?.availability;
	const entryByUserId = availabilityEntryByUserId(data);
	const requireInGameNames = tournament.ctx.settings.requireInGameNames;

	return (
		<div>
			<div className="stack xs horizontal justify-between items-end flex-wrap">
				<h3 className={styles.sectionHeader}>
					2. {t("tournament:pre.roster.header")}
				</h3>
				{availability?.window ? (
					<AvailabilityWindowText window={availability.window} />
				) : null}
			</div>
			<section className={clsx(styles.section, "stack sm")}>
				{availability?.beyondHorizon ? (
					<div className={styles.rosterMutedNote}>
						{t("schedule:registration.beyondHorizon", {
							date: dateFormatter.format(availability.beyondHorizon.opensAt),
						})}
					</div>
				) : null}
				<ul className={styles.rosterRows}>
					{ownTeamMembers.map((member, i) => (
						<AvailabilityMemberRow
							key={member.userId}
							user={{
								id: member.userId,
								username: member.username,
								discordId: member.discordId,
								discordAvatar: member.discordAvatar,
								customAvatarUrl: member.customAvatarUrl,
							}}
							entry={entryByUserId?.get(member.userId)}
							showAvailability={Boolean(entryByUserId)}
							primaryName={
								requireInGameNames
									? (member.inGameName ?? member.username)
									: member.username
							}
							secondaryName={
								requireInGameNames && member.inGameName
									? member.username
									: undefined
							}
							nameTestId={`member-num-${i + 1}`}
							trailing={
								canRemoveMembers && member.role !== "OWNER" ? (
									<RemoveMemberButton member={member} />
								) : null
							}
						/>
					))}
					{Array.from({ length: missingMembers }).map((_, i) => (
						<li key={`required-${i}`} className={styles.emptySlotRow}>
							<span className={styles.emptySlotCircle}>
								<UserRound size={14} strokeWidth={3} />
							</span>
							{t("tournament:pre.roster.emptySlot")}
						</li>
					))}
					{Array.from({ length: optionalMembers }).map((_, i) => (
						<li
							key={`optional-${i}`}
							className={clsx(styles.emptySlotRow, styles.emptySlotRowOptional)}
						>
							<span
								className={clsx(
									styles.emptySlotCircle,
									styles.emptySlotCircleOptional,
								)}
							>
								<UserRound size={14} strokeWidth={3} />
							</span>
							{t("tournament:pre.roster.emptySlot.optional")}
						</li>
					))}
				</ul>
				{entryByUserId ? (
					<AvailabilitySummary
						statuses={ownTeamMembers.map((member) =>
							availabilityRowStatus(entryByUserId.get(member.userId)),
						)}
					/>
				) : null}
				{canAddMembers ? (
					<div className={clsx(styles.addMembers, "stack md")}>
						<h4 className={styles.addMembersHeading}>
							{t("tournament:pre.roster.addMembers")}
						</h4>
						{quickAddPlayers.length > 0 ? (
							<QuickAddPlayers
								key={quickAddPlayers.map((player) => player.id).join(",")}
								players={quickAddPlayers}
								teams={data?.friendPlayers?.teams ?? []}
								spotsLeft={tournament.maxMembersPerTeam - ownTeamMembers.length}
								entryByUserId={entryByUserId}
							/>
						) : null}
						<InviteLinkInput link={inviteLink} />
					</div>
				) : null}
			</section>
			{tournament.ctx.settings.requireInGameNames ? (
				<div className={clsx(styles.sectionWarning, "text-warning")}>
					{t("tournament:pre.roster.ignWarning")}
				</div>
			) : (
				<div className={styles.sectionWarning}>
					{tournament.minMembersPerTeam <= 3
						? t("tournament:pre.roster.footer.noSubs", {
								format: `${tournament.minMembersPerTeam}v${tournament.minMembersPerTeam}`,
							})
						: t("tournament:pre.roster.footer", {
								atLeastCount: tournament.minMembersPerTeam,
								maxCount: tournament.maxMembersPerTeam,
							})}
				</div>
			)}
		</div>
	);
}

function QuickAddPlayers({
	players,
	teams,
	spotsLeft,
	entryByUserId,
}: {
	players: Array<QuickAddPlayer>;
	teams: Array<{ id: number; name: string }>;
	spotsLeft: number;
	entryByUserId: Map<number, AvailabilityPanelEntry> | null;
}) {
	const { t } = useTranslation(["tournament", "common"]);
	const fetcher = useFetcher();

	const sortByAvailability = (toSort: Array<QuickAddPlayer>) =>
		entryByUserId
			? R.sortBy(
					toSort,
					(player) =>
						QUICK_ADD_STATUS_ORDER[
							availabilityRowStatus(entryByUserId.get(player.id))
						],
				)
			: toSort;

	const uniquePlayers = R.uniqueBy(players, (player) => player.id);

	const teamGroups = teams
		.map((team) => ({
			team,
			players: sortByAvailability(
				uniquePlayers.filter((player) => player.teamId === team.id),
			),
		}))
		.filter((group) => group.players.length > 0);

	const pickupPlayers = sortByAvailability(
		uniquePlayers.filter((player) => !player.teamId),
	);

	const sections = [
		...teamGroups.map((group) => ({
			key: `team-${group.team.id}`,
			heading: group.team.name,
			players: group.players,
		})),
		...(pickupPlayers.length > 0
			? [
					{
						key: "pickup",
						heading: t("tournament:pre.roster.quickAdd.pickup"),
						players: pickupPlayers,
					},
				]
			: []),
	];

	const [selectedUserId, setSelectedUserId] = React.useState<number | null>(
		sections[0]?.players[0]?.id ?? null,
	);

	const addAllByTeam = teams
		.map((team) => ({
			team,
			// in the loader's order so the list matches what the action adds when clamped
			playersToAdd: players
				.filter(
					(player) =>
						player.teamId === team.id && getMemberRoleType(player) !== "OTHER",
				)
				.slice(0, spotsLeft),
		}))
		.filter((entry) => entry.playersToAdd.length > 0);

	const renderPlayerItem = (player: QuickAddPlayer) => (
		<SendouSelectItem
			key={player.id}
			id={player.id}
			textValue={player.username}
			data-testid={`availability-row-${player.id}`}
			data-status={
				entryByUserId
					? availabilityRowStatus(entryByUserId.get(player.id))
					: undefined
			}
		>
			{entryByUserId ? (
				<span className={styles.quickAddItem}>
					<Text slot="label">{player.username}</Text>
					<Text slot="description">
						<span className={styles.quickAddItemAvailability}>
							<AvailabilityStatusDots
								statuses={[availabilityRowStatus(entryByUserId.get(player.id))]}
							/>
							<AvailabilityRowDetail entry={entryByUserId.get(player.id)} />
						</span>
					</Text>
				</span>
			) : (
				player.username
			)}
		</SendouSelectItem>
	);

	return (
		<div className="stack sm">
			<fetcher.Form method="post">
				<div className={styles.quickAddRow}>
					<SendouSelect
						label={t("tournament:pre.roster.quickAdd")}
						items={sections}
						selectedKey={selectedUserId}
						onSelectionChange={(key) => setSelectedUserId(key as number | null)}
						estimatedRowHeight={entryByUserId ? 52 : undefined}
						className={styles.quickAddSelect}
						data-testid="quick-add-select"
					>
						{(section) => (
							<SendouSelectItemSection
								key={section.key}
								heading={section.heading}
							>
								{section.players.map(renderPlayerItem)}
							</SendouSelectItemSection>
						)}
					</SendouSelect>
					{selectedUserId ? (
						<input type="hidden" name="userId" value={selectedUserId} />
					) : null}
					<SubmitButton
						schema={addPlayerSchema}
						_action="ADD_PLAYER"
						state={fetcher.state}
						testId="add-player-button"
						isDisabled={!selectedUserId}
					>
						{t("common:actions.add")}
					</SubmitButton>
				</div>
			</fetcher.Form>
			{addAllByTeam.length > 0 ? (
				<div className={styles.quickAddAllRow}>
					{addAllByTeam.map(({ team, playersToAdd }) => (
						<ActionButton
							key={team.id}
							schema={addTeamPlayersSchema}
							action="ADD_TEAM_PLAYERS"
							fields={{ teamId: team.id }}
							size="small"
							variant="outlined"
							icon={<UsersRound />}
							testId={`add-team-players-button-${team.id}`}
							confirm={{
								dialogHeading: t(
									"tournament:pre.roster.quickAdd.addAll.confirm",
									{ team: team.name },
								),
								description: playersToAdd
									.map((player) => player.username)
									.join(", "),
								submitButtonText: t("common:actions.add"),
								submitButtonVariant: "primary",
							}}
						>
							{t("tournament:pre.roster.quickAdd.addAll", {
								team: team.name,
							})}
						</ActionButton>
					))}
				</div>
			) : null}
		</div>
	);
}

function RemoveMemberButton({
	member,
}: {
	member: TournamentTeamFull["members"][number];
}) {
	const { t } = useTranslation(["tournament", "common"]);

	return (
		<FormWithConfirm
			dialogHeading={t("tournament:pre.roster.remove.confirm", {
				name: member.username,
			})}
			submitButtonText={t("common:actions.remove")}
			fields={[
				["_action", "DELETE_TEAM_MEMBER"],
				["userId", member.userId],
			]}
		>
			<SendouButton
				size="small"
				variant="minimal-destructive"
				icon={<X />}
				aria-label={t("common:actions.remove")}
				testId={`remove-member-${member.userId}`}
			/>
		</FormWithConfirm>
	);
}

function TeamCounterPickMapPoolPicker({
	readOnly = false,
	mapPool,
}: {
	readOnly?: boolean;
	mapPool?: NonNullable<TournamentTeamFull["mapPool"]>;
}) {
	const { t } = useTranslation(["common", "game-misc", "tournament"]);
	const fetcher = useFetcher();
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const [counterPickMaps, setCounterPickMaps] =
		React.useState<CounterPickMapPool>(mapPool ?? data?.mapPool ?? []);

	const validationStatus =
		useCounterPickMapPoolValidationStatus(counterPickMaps);

	return (
		<div>
			<h3 className={styles.sectionHeader}>
				3. {t("tournament:pre.pool.header")}
			</h3>
			<section className={styles.section}>
				<fetcher.Form method="post" className="stack lg">
					<input
						type="hidden"
						name="mapPool"
						value={JSON.stringify(counterPickMaps)}
					/>
					<CounterPickMapPoolPicker
						mapPool={counterPickMaps}
						onChange={setCounterPickMaps}
						disabled={readOnly}
					/>
					{readOnly ? null : validationStatus === "VALID" ? (
						<SubmitButton
							schema={updateMapPoolSchema}
							_action="UPDATE_MAP_POOL"
							state={fetcher.state}
							className="self-center mt-4"
							testId="save-map-list-button"
						>
							{t("common:actions.save")}
						</SubmitButton>
					) : (
						<MapPoolValidationStatusMessage status={validationStatus} />
					)}
				</fetcher.Form>
			</section>
		</div>
	);
}

function SelectedTeamAvailability() {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const tournament = useTournament();
	const { values } = useFormFieldContext();

	const availability = data?.availability;
	if (!availability) return null;

	const teamId = values.teamId ? Number(values.teamId) : null;

	const inTournament = (userId: number) =>
		tournament.ctx.teams.some((team) => team.memberUserIds.includes(userId));

	const entryByUserId = availabilityEntryByUserId(data);
	const isFree = (userId: number) => {
		const status = availabilityRowStatus(entryByUserId?.get(userId));
		return status === "available" || status === "partial";
	};

	// with a team selected the panel shows its full roster; as a pickup it lists everyone the viewer
	// could recruit (all their teams' members and friends) that is free during the event
	const roster = teamId
		? (data?.friendPlayers?.friends ?? []).filter(
				(friend) => friend.teamId === teamId,
			)
		: R.uniqueBy(
				data?.friendPlayers?.friends ?? [],
				(friend) => friend.id,
			).filter((friend) => !inTournament(friend.id) && isFree(friend.id));
	if (roster.length === 0 && !availability.beyondHorizon) return null;

	return (
		<RegistrationAvailabilityPanel
			availability={availability}
			roster={roster}
			subCandidates={
				teamId
					? subCandidates({
							data,
							tournament,
							rosterUserIds: roster.map((rosterUser) => rosterUser.id),
						})
					: []
			}
		/>
	);
}

function availabilityEntryByUserId(
	data: ReturnType<typeof useLoaderData<TournamentRegisterPageLoader>>,
) {
	const availability = data?.availability;
	if (!availability || availability.beyondHorizon) return null;

	return new Map(availability.entries.map((entry) => [entry.userId, entry]));
}

function teamMemberStatuses({
	data,
	teamId,
	entryByUserId,
}: {
	data: ReturnType<typeof useLoaderData<TournamentRegisterPageLoader>>;
	teamId: number;
	entryByUserId: Map<number, AvailabilityPanelEntry>;
}): Array<AvailabilityRowStatus> {
	return (data?.friendPlayers?.friends ?? [])
		.filter((friend) => friend.teamId === teamId)
		.map((friend) => availabilityRowStatus(entryByUserId.get(friend.id)));
}

function subCandidates({
	data,
	tournament,
	rosterUserIds,
}: {
	data: ReturnType<typeof useLoaderData<TournamentRegisterPageLoader>>;
	tournament: ReturnType<typeof useTournament>;
	rosterUserIds: number[];
}) {
	const inTournament = (userId: number) =>
		tournament.ctx.teams.some((team) => team.memberUserIds.includes(userId));

	return R.uniqueBy(
		data?.friendPlayers?.friends ?? [],
		(friend) => friend.id,
	).filter(
		(friend) => !rosterUserIds.includes(friend.id) && !inTournament(friend.id),
	);
}

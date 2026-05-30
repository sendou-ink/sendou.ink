import clsx from "clsx";
import Compressor from "compressorjs";
import { AlertCircle, Check, Trash, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher, useLoaderData } from "react-router";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { containerClassName } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { imgTypeToDimensions } from "~/features/img-upload/upload-constants";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { ModeMapPoolPicker } from "~/features/settings/components/ModeMapPoolPicker";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	LOG_IN_URL,
	SENDOU_INK_BASE_URL,
	tournamentJoinPage,
	userEditProfilePage,
} from "~/utils/urls";
import { action } from "../actions/to.$id.register.server";
import type { TournamentRegisterPageLoader } from "../loaders/to.$id.register.server";
import { loader } from "../loaders/to.$id.register.server";
import styles from "../tournament.module.css";
import { TOURNAMENT } from "../tournament-constants";
import {
	type CounterPickValidationStatus,
	validateCounterPickMapPool,
} from "../tournament-utils";
import { useTournament } from "./to.$id";

export { action, loader };

export default function TournamentRegisterPage() {
	const user = useUser();
	const tournament = useTournament();
	const { t } = useTranslation(["tournament"]);

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	const teamOwned = tournament.ownedTeamByUser(user);
	const isRegularMemberOfATeam = teamMemberOf && !teamOwned;

	const showAddIGNAlert =
		tournament.ctx.settings.requireInGameNames &&
		!teamOwned &&
		user &&
		!user?.inGameName;

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{isRegularMemberOfATeam ? (
				<div className="stack md items-center">
					<Alert>{t("tournament:pre.inATeam")}</Alert>
					<LeaveTeamControl />
				</div>
			) : showAddIGNAlert ? (
				<div>
					<Alert variation="WARNING">
						<div className="stack horizontal sm items-center flex-wrap justify-center text-center">
							This tournament requires you to have an in-game name set{" "}
							<LinkButton to={userEditProfilePage(user)} size="small">
								Edit profile
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
	const user = useUser();
	const tournament = useTournament();

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	if (!teamMemberOf) return null;

	const checkedIn = teamMemberOf.checkIns.length > 0;
	const cannotLeave = checkedIn || !tournament.registrationOpen;

	if (cannotLeave) {
		return (
			<SendouPopover
				trigger={
					<SendouButton className="small-text" variant="minimal-destructive">
						Leave the team
					</SendouButton>
				}
			>
				{checkedIn
					? "Your team has checked in. Contact the TO to leave the team."
					: "Registration has closed. Contact the TO to leave the team."}
			</SendouPopover>
		);
	}

	return (
		<FormWithConfirm
			dialogHeading={`Leave "${teamMemberOf.name}"?`}
			fields={[["_action", "LEAVE_TEAM"]]}
			submitButtonText="Leave"
		>
			<SendouButton
				className="small-text"
				variant="minimal-destructive"
				type="submit"
			>
				Leave the team
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

function RegistrationForms() {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const user = useUser();
	const tournament = useTournament();

	const ownTeam = tournament.ownedTeamByUser(user);
	const ownTeamCheckedIn = Boolean(ownTeam && ownTeam.checkIns.length > 0);
	const hasFriendCodeSet = Boolean(user?.friendCode);

	if (!user && !tournament.isInvitational) {
		return <PleaseLogIn />;
	}

	const showRegistrationProgress = () => {
		if (ownTeam) return true;

		return !tournament.isInvitational;
	};

	const showRegisterNewTeam = () => {
		if (ownTeam) return true;
		if (tournament.isInvitational) return false;
		if (!tournament.registrationOpen) return false;

		return !tournament.regularCheckInHasEnded;
	};

	return (
		<div className="stack lg">
			{showRegisterNewTeam() ? <FriendCode /> : null}
			{hasFriendCodeSet ? (
				showRegistrationProgress() ? (
					<RegistrationProgress
						checkedIn={ownTeamCheckedIn}
						name={ownTeam?.name}
						mapPool={data?.mapPool ?? undefined}
						members={ownTeam?.members}
					/>
				) : (
					<Alert>
						This tournament is invitational. Tournament organizer adds all
						teams.
					</Alert>
				)
			) : null}
			{showRegisterNewTeam() && hasFriendCodeSet ? (
				<TeamInfo
					ownTeam={ownTeam}
					canUnregister={Boolean(ownTeam && !ownTeamCheckedIn)}
				/>
			) : null}
			{tournament.isLeagueSignup ? <GoogleFormsLink /> : null}
			{ownTeam && hasFriendCodeSet ? (
				<>
					<FillRoster ownTeam={ownTeam} ownTeamCheckedIn={ownTeamCheckedIn} />
					{tournament.teamsPrePickMaps ? (
						<CounterPickMapPoolPicker key={tournament.ctx.id} />
					) : null}
				</>
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
		!tournament.isLeagueSignup
			? {
					name: t("tournament:pre.steps.check-in"),
					status: completedIfTruthy(checkedIn),
				}
			: null,
		tournament.isLeagueSignup
			? {
					name: "Google Sheet",
					status: "notice" as const,
				}
			: null,
	].filter((step) => step !== null);

	const regClosesBeforeStart =
		tournament.registrationClosesAt.getTime() !==
		tournament.ctx.startTime.getTime();

	const registrationClosesAtString =
		registrationClosesFormatter.format(
			tournament.isLeagueSignup
				? tournament.ctx.startTime
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
										className={clsx(styles.sectionIcon, "color-success")}
										data-testid={`checkmark-icon-num-${i + 1}`}
									/>
								) : step.status === "notice" ? (
									<AlertCircle
										className={clsx(styles.sectionIcon, "color-info")}
									/>
								) : (
									<X className={clsx(styles.sectionIcon, "color-error")} />
								)}
							</div>
						);
					})}
				</div>
				{!tournament.isLeagueSignup ? (
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
				{regClosesBeforeStart || tournament.isLeagueSignup ? (
					<span className="text-warning">
						Registration closes at {registrationClosesAtString}
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
	const fetcher = useFetcher();
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
		<fetcher.Form method="post" className="stack items-center">
			<SubmitButton
				size="small"
				_action="CHECK_IN"
				state={fetcher.state}
				testId="check-in-button"
			>
				{t("tournament:pre.checkIn.button")}
			</SubmitButton>
		</fetcher.Form>
	);
}

function TeamInfo({
	ownTeam,
	canUnregister,
}: {
	ownTeam?: TournamentDataTeam | null;
	canUnregister: boolean;
}) {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const { t } = useTranslation(["tournament", "common"]);
	const fetcher = useFetcher();
	const tournament = useTournament();
	const [teamName, setTeamName] = React.useState(ownTeam?.name ?? "");
	const user = useUser();
	const ref = React.useRef<HTMLFormElement>(null);
	const [signUpWithTeamId, setSignUpWithTeamId] = React.useState(
		() => tournament.ownedTeamByUser(user)?.team?.id ?? null,
	);
	const [uploadedAvatar, setUploadedAvatar] = React.useState<File | null>(null);

	const handleSignUpWithTeamChange = (teamId: number | null) => {
		if (!teamId) {
			setSignUpWithTeamId(null);
		} else {
			setSignUpWithTeamId(teamId);
			const teamName = data?.teams.find((team) => team.id === teamId)?.name;
			invariant(teamName, "team name should exist");

			setTeamName(teamName);
		}
	};

	const handleSubmit = () => {
		const formData = new FormData(ref.current!);

		if (uploadedAvatar) {
			formData.delete("img");
			formData.append("img", uploadedAvatar, uploadedAvatar.name);
		}

		fetcher.submit(formData, {
			encType: uploadedAvatar ? "multipart/form-data" : undefined,
			method: "post",
		});
	};

	const submitButtonDisabled = () => {
		if (fetcher.state !== "idle") return true;

		return false;
	};

	const avatarUrl = (() => {
		if (signUpWithTeamId) {
			const teamToSignUpWith = data?.teams.find(
				(team) => team.id === signUpWithTeamId,
			);
			return teamToSignUpWith?.logoUrl;
		}
		if (uploadedAvatar) return URL.createObjectURL(uploadedAvatar);

		return ownTeam?.pickupAvatarUrl;
	})();

	const canEditAvatar =
		tournament.registrationOpen &&
		!signUpWithTeamId &&
		uploadedAvatar &&
		!ownTeam?.pickupAvatarUrl;

	const canDeleteAvatar = ownTeam?.pickupAvatarUrl;

	return (
		<div>
			<div className="stack horizontal justify-between">
				<h3 className={styles.sectionHeader}>
					1. {t("tournament:pre.info.header")}
				</h3>
				{canUnregister &&
				tournament.isLeagueSignup &&
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
						Unregistration from a league after the registration has ended is
						handled by the organizers
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
				<Form method="post" className="stack md items-center" ref={ref}>
					<input type="hidden" name="_action" value="UPSERT_TEAM" />
					{signUpWithTeamId ? (
						<input type="hidden" name="teamId" value={signUpWithTeamId} />
					) : null}
					<div className="stack sm-plus items-center">
						{data && data.teams.length > 0 && tournament.registrationOpen ? (
							<div className={styles.sectionInputContainer}>
								<Label htmlFor="signingUpAs">Team signing up as</Label>
								<select
									id="signingUpAs"
									value={signUpWithTeamId ?? ""}
									onChange={(e) => {
										if (e.target.value === "") {
											handleSignUpWithTeamChange(null);
										} else {
											handleSignUpWithTeamChange(Number(e.target.value));
										}
									}}
								>
									<option value="">Sign up with pick-up</option>
									{data.teams.map((team) => {
										return (
											<option key={team.id} value={team.id}>
												{team.name}
											</option>
										);
									})}
								</select>
							</div>
						) : null}

						{!signUpWithTeamId ? (
							<div className={styles.sectionInputContainer}>
								<Label htmlFor="teamName">
									{data && data.teams.length > 0
										? "Pick-up name"
										: t("tournament:pre.steps.name")}
								</Label>
								<Input
									name="teamName"
									id="teamName"
									required
									maxLength={TOURNAMENT.TEAM_NAME_MAX_LENGTH}
									value={teamName}
									onChange={(e) => setTeamName(e.target.value)}
									readOnly={
										!tournament.registrationOpen || Boolean(signUpWithTeamId)
									}
								/>
							</div>
						) : (
							<input type="hidden" name="teamName" value={teamName} />
						)}
						{tournament.registrationOpen || avatarUrl ? (
							<div className={styles.sectionInputContainer}>
								<Label htmlFor="logo">Logo</Label>
								{avatarUrl ? (
									<div className="stack horizontal md items-center">
										<Avatar size="xsm" url={avatarUrl} />
										{canEditAvatar ? (
											<SendouButton
												variant="minimal"
												size="small"
												onPress={() => setUploadedAvatar(null)}
											>
												{t("common:actions.edit")}
											</SendouButton>
										) : null}
										{canDeleteAvatar ? (
											<FormWithConfirm
												dialogHeading="Delete team logo?"
												fields={[["_action", "DELETE_LOGO"]]}
											>
												<SendouButton
													variant="minimal-destructive"
													size="small"
													type="submit"
												>
													<Trash className="small-icon" />
												</SendouButton>
											</FormWithConfirm>
										) : null}
									</div>
								) : (
									<TournamentLogoUpload onChange={setUploadedAvatar} />
								)}
							</div>
						) : null}
						<div className="stack sm">
							<div className="text-lighter text-sm stack horizontal sm items-center">
								<input
									id="no-host"
									type="checkbox"
									name="prefersNotToHost"
									defaultChecked={Boolean(ownTeam?.prefersNotToHost)}
								/>
								<label htmlFor="no-host" className="mb-0">
									{t("tournament:pre.info.noHost")}
								</label>
							</div>
						</div>
					</div>
					<SendouButton
						data-testid="save-team-button"
						isDisabled={submitButtonDisabled()}
						onPress={handleSubmit}
					>
						{t("common:actions.save")}
					</SendouButton>
				</Form>
			</section>
		</div>
	);
}

const logoDimensions = imgTypeToDimensions["team-pfp"];
function TournamentLogoUpload({
	onChange,
}: {
	onChange: (file: File | null) => void;
}) {
	return (
		<input
			id="img-field"
			type="file"
			name="img"
			accept="image/png, image/jpeg, image/webp"
			onChange={(e) => {
				const uploadedFile = e.target.files?.[0];
				if (!uploadedFile) {
					onChange(null);
					return;
				}

				new Compressor(uploadedFile, {
					height: logoDimensions.height,
					width: logoDimensions.width,
					maxHeight: logoDimensions.height,
					maxWidth: logoDimensions.width,
					convertSize: 500_000,
					resize: "cover",
					success(result) {
						const file = new File([result], "img.webp", {
							type: "image/webp",
						});
						onChange(file);
					},
					error(err) {
						logger.error(err.message);
					},
				});
			}}
		/>
	);
}

function FriendCode() {
	const user = useUser();

	if (!user?.friendCode) {
		return (
			<div className="stack items-center">
				<FriendCodePopover size="small" />
				<div className={clsx(styles.sectionWarning, "mt-2")}>
					To play tournaments on sendou.ink you'll need to register your friend
					code.
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
	return (
		<div>
			<h3 className={styles.sectionHeader}>
				Additional Requirement: Google Form
			</h3>
			<section className={clsx(styles.section, "stack lg items-center")}>
				<a
					href={import.meta.env.VITE_LEAGUE_GOOGLE_FORM_URL}
					className="py-4 font-bold"
					target="_blank"
					rel="noopener noreferrer"
				>
					Answer survey hosted on Google Forms
				</a>
			</section>
			<div className={styles.sectionWarning}>
				Answer to additional question about your team's preferred match time and
				info to help with seeding
			</div>
		</div>
	);
}

function FillRoster({
	ownTeam,
	ownTeamCheckedIn,
}: {
	ownTeam: TournamentDataTeam;
	ownTeamCheckedIn: boolean;
}) {
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const user = useUser();
	const tournament = useTournament();
	const [, copyToClipboard] = useCopyToClipboard();
	const { t } = useTranslation(["common", "tournament"]);

	const inviteLink = `${SENDOU_INK_BASE_URL}${tournamentJoinPage({
		tournamentId: tournament.ctx.id,
		inviteCode: ownTeam.inviteCode!,
	})}`;

	const { members: ownTeamMembers } = tournament.ownedTeamByUser(user) ?? {};
	invariant(ownTeamMembers, "own team members should exist");

	const missingMembers = Math.max(
		tournament.minMembersPerTeam - ownTeamMembers.length,
		0,
	);

	const optionalMembers = Math.max(
		tournament.maxMembersPerTeam - ownTeamMembers.length - missingMembers,
		0,
	);

	const showDeleteMemberSection =
		(!ownTeamCheckedIn && ownTeamMembers.length > 1) ||
		(ownTeamCheckedIn && ownTeamMembers.length > tournament.minMembersPerTeam);

	const playersAvailableToDirectlyAdd = (() => {
		return (data!.friendPlayers?.friends ?? []).filter((user) => {
			const isNotInTeam = tournament.ctx.teams.every((team) =>
				team.members.every((member) => member.userId !== user.id),
			);

			const hasInGameNameIfNeeded =
				!tournament.ctx.settings.requireInGameNames || user.inGameName;

			return isNotInTeam && hasInGameNameIfNeeded;
		});
	})();

	const teamIsFull = ownTeamMembers.length >= tournament.maxMembersPerTeam;
	const canAddMembers = !teamIsFull && tournament.registrationOpen;

	return (
		<div>
			<h3 className={styles.sectionHeader}>
				2. {t("tournament:pre.roster.header")}
			</h3>
			<section className={clsx(styles.section, "stack lg items-center")}>
				{playersAvailableToDirectlyAdd.length > 0 && canAddMembers ? (
					<>
						<DirectlyAddPlayerSelect
							players={playersAvailableToDirectlyAdd}
							teams={data!.friendPlayers?.teams ?? []}
						/>
						<Divider className="text-uppercase">{t("common:or")}</Divider>
					</>
				) : null}
				{canAddMembers ? (
					<div className="stack md items-center">
						<div className="text-center text-sm">
							{t("tournament:actions.shareLink", { inviteLink })}
						</div>
						<div>
							<SendouButton
								size="small"
								onPress={() => copyToClipboard(inviteLink)}
								variant="outlined"
							>
								{t("common:actions.copyToClipboard")}
							</SendouButton>
						</div>
					</div>
				) : null}
				<div className={styles.rosterGrid}>
					{ownTeamMembers.map((member, i) => {
						return (
							<div
								key={member.userId}
								className="stack sm items-center text-sm"
								data-testid={`member-num-${i + 1}`}
							>
								<Avatar size="xsm" user={member} />
								{tournament.ctx.settings.requireInGameNames ? (
									<div className={styles.rosterGridMemberName}>
										<div className="text-center">
											{member.inGameName ?? member.username}
										</div>
										{member.inGameName ? (
											<div className="text-lighter text-xs font-bold text-center">
												{member.username}
											</div>
										) : null}
									</div>
								) : (
									<div className={styles.rosterGridMemberName}>
										{member.username}
									</div>
								)}
							</div>
						);
					})}
					{new Array(missingMembers).fill(null).map((_, i) => {
						return (
							<div key={i} className={styles.missingPlayer}>
								?
							</div>
						);
					})}
					{new Array(optionalMembers).fill(null).map((_, i) => {
						return (
							<div
								key={i}
								className={clsx(
									styles.missingPlayer,
									styles.missingPlayerOptional,
								)}
							>
								?
							</div>
						);
					})}
				</div>
				{showDeleteMemberSection ? (
					<DeleteMember members={ownTeamMembers} />
				) : null}
			</section>
			{tournament.ctx.settings.requireInGameNames ? (
				<div className={clsx(styles.sectionWarning, "text-warning")}>
					Note that you are expected to use the in-game names as listed above.
					Playing in the event with a different name or using the alias feature
					might result in disqualification.
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

function DirectlyAddPlayerSelect({
	players,
	teams,
}: {
	players: { id: number; username: string; teamId?: number }[];
	teams: { id: number; name: string }[];
}) {
	const { t } = useTranslation(["tournament", "common"]);
	const fetcher = useFetcher();
	const id = React.useId();

	const othersOptions = players
		.filter((player) => !player.teamId)
		.map((player) => {
			return (
				<option key={player.id} value={player.id}>
					{player.username}
				</option>
			);
		});

	return (
		<fetcher.Form method="post" className="stack horizontal sm items-end">
			<div>
				<Label htmlFor={id}>
					{t("tournament:pre.roster.addFriend.header")}
				</Label>
				<select id={id} name="userId">
					{teams.map((team) => {
						return (
							<optgroup label={team.name} key={team.id}>
								{players
									.filter((player) => player.teamId === team.id)
									.map((player) => {
										return (
											<option key={player.id} value={player.id}>
												{player.username}
											</option>
										);
									})}
							</optgroup>
						);
					})}
					{teams && teams.length > 0 ? (
						<optgroup label="Others">{othersOptions}</optgroup>
					) : (
						othersOptions
					)}
				</select>
			</div>
			<SubmitButton
				_action="ADD_PLAYER"
				state={fetcher.state}
				testId="add-player-button"
			>
				{t("common:actions.add")}
			</SubmitButton>
		</fetcher.Form>
	);
}

function DeleteMember({ members }: { members: TournamentDataTeam["members"] }) {
	const { t } = useTranslation(["tournament", "common"]);
	const id = React.useId();
	const fetcher = useFetcher();
	const [expanded, setExpanded] = React.useState(false);

	if (!expanded) {
		return (
			<SendouButton
				size="small"
				variant="minimal-destructive"
				onPress={() => setExpanded(true)}
			>
				{t("tournament:pre.roster.delete.button")}
			</SendouButton>
		);
	}

	return (
		<fetcher.Form method="post">
			<Label htmlFor={id}>{t("tournament:pre.roster.delete.header")}</Label>
			<div className="stack md horizontal">
				<select name="userId" id={id}>
					{members
						.filter((member) => member.role !== "OWNER")
						.map((member) => (
							<option key={member.userId} value={member.userId}>
								{member.username}
							</option>
						))}
				</select>
				<SubmitButton
					state={fetcher.state}
					_action="DELETE_TEAM_MEMBER"
					variant="minimal-destructive"
				>
					{t("common:actions.delete")}
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function CounterPickMapPoolPicker() {
	const { t } = useTranslation(["common", "game-misc", "tournament"]);
	const tournament = useTournament();
	const fetcher = useFetcher();
	const data = useLoaderData<TournamentRegisterPageLoader>();
	const [counterPickMaps, setCounterPickMaps] = React.useState(
		data?.mapPool ?? [],
	);

	const counterPickMapPool = new MapPool(counterPickMaps);

	const isOneModeTournamentOf =
		tournament.modesIncluded.length === 1 ? tournament.modesIncluded[0] : null;

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
					{rankedModesShort
						.filter(
							(mode) =>
								!isOneModeTournamentOf || isOneModeTournamentOf === mode,
						)
						.map((mode) => {
							return (
								<ModeMapPoolPicker
									key={mode}
									amountToPick={
										isOneModeTournamentOf
											? TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE
											: TOURNAMENT.COUNTERPICK_MAPS_PER_MODE
									}
									mode={mode}
									tiebreaker={
										tournament.ctx.tieBreakerMapPool.find(
											(stage) => stage.mode === mode,
										)?.stageId
									}
									pool={
										counterPickMaps
											.filter((m) => m.mode === mode)
											.map((m) => m.stageId) ?? []
									}
									onChange={(stageIds) =>
										setCounterPickMaps([
											...counterPickMaps.filter((m) => m.mode !== mode),
											...stageIds.map((stageId) => ({ mode, stageId })),
										])
									}
								/>
							);
						})}
					{validateCounterPickMapPool(
						counterPickMapPool,
						isOneModeTournamentOf,
						tournament.ctx.tieBreakerMapPool,
					) === "VALID" ? (
						<SubmitButton
							_action="UPDATE_MAP_POOL"
							state={fetcher.state}
							className="self-center mt-4"
							testId="save-map-list-button"
						>
							{t("common:actions.save")}
						</SubmitButton>
					) : (
						<MapPoolValidationStatusMessage
							status={validateCounterPickMapPool(
								counterPickMapPool,
								isOneModeTournamentOf,
								tournament.ctx.tieBreakerMapPool,
							)}
						/>
					)}
				</fetcher.Form>
			</section>
		</div>
	);
}

function MapPoolValidationStatusMessage({
	status,
}: {
	status: CounterPickValidationStatus;
}) {
	const { t } = useTranslation(["common"]);

	if (
		status !== "TOO_MUCH_STAGE_REPEAT" &&
		status !== "STAGE_REPEAT_IN_SAME_MODE" &&
		status !== "INCLUDES_BANNED" &&
		status !== "INCLUDES_TIEBREAKER"
	)
		return null;

	return (
		<div className="mt-4">
			<Alert alertClassName="w-max" variation="WARNING" tiny>
				{t(`common:maps.validation.${status}`, {
					maxStageRepeat: TOURNAMENT.COUNTERPICK_MAX_STAGE_REPEAT,
				})}
			</Alert>
		</div>
	);
}

import { useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { containerClassName } from "~/components/Main";
import { Redirect } from "~/components/Redirect";
import { SubmitButton } from "~/components/SubmitButton";
import { UserSearch } from "~/components/UserSearch";
import { TrashIcon } from "~/components/icons/Trash";
import { USER } from "~/constants";
import { useUser } from "~/features/auth/core/user";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { TournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import {
	calendarEventPage,
	teamPage,
	tournamentEditPage,
	tournamentPage,
} from "~/utils/urls";
import { Dialog } from "../../../components/Dialog";
import { BracketProgressionSelector } from "../../calendar/components/BracketProgressionSelector";
import { useTournament } from "./to.$id";

import { action } from "../actions/to.$id.admin.server";
export { action };

export default function TournamentAdminPage() {
	const { t } = useTranslation(["calendar"]);
	const tournament = useTournament();
	const [editingProgression, setEditingProgression] = React.useState(false);

	const user = useUser();

	// biome-ignore lint/correctness/useExhaustiveDependencies: we want to close the dialog after the progression was updated
	React.useEffect(() => {
		setEditingProgression(false);
	}, [tournament]);

	if (!tournament.isOrganizer(user) || tournament.everyBracketOver) {
		return <Redirect to={tournamentPage(tournament.ctx.id)} />;
	}

	return (
		<div className={clsx("stack lg", containerClassName("normal"))}>
			{tournament.isAdmin(user) && !tournament.hasStarted ? (
				<div className="stack horizontal items-end">
					<LinkButton
						to={tournamentEditPage(tournament.ctx.eventId)}
						size="tiny"
						variant="outlined"
						testId="edit-event-info-button"
					>
						Edit event info
					</LinkButton>
					{!tournament.isLeagueSignup ? (
						<FormWithConfirm
							dialogHeading={t("calendar:actions.delete.confirm", {
								name: tournament.ctx.name,
							})}
							action={calendarEventPage(tournament.ctx.eventId)}
							submitButtonTestId="delete-submit-button"
						>
							<Button
								className="ml-auto"
								size="tiny"
								variant="minimal-destructive"
								type="submit"
							>
								{t("calendar:actions.delete")}
							</Button>
						</FormWithConfirm>
					) : null}
				</div>
			) : null}
			{tournament.isAdmin(user) &&
			tournament.hasStarted &&
			!tournament.ctx.isFinalized ? (
				<div className="stack horizontal justify-end">
					<Button
						onClick={() => setEditingProgression(true)}
						size="tiny"
						variant="outlined"
						testId="edit-event-info-button"
					>
						Edit brackets
					</Button>
					{editingProgression ? (
						<BracketProgressionEditDialog
							close={() => setEditingProgression(false)}
						/>
					) : null}
				</div>
			) : null}
			<Divider smallText>Team actions</Divider>
			<TeamActions />
			{tournament.isAdmin(user) ? (
				<>
					<Divider smallText>Staff</Divider>
					<Staff />
				</>
			) : null}
			<Divider smallText>Cast Twitch Accounts</Divider>
			<CastTwitchAccounts />
			<Divider smallText>Participant list download</Divider>
			<DownloadParticipants />
			{!tournament.isLeagueSignup ? (
				<>
					<Divider smallText>Bracket reset</Divider>
					<BracketReset />
				</>
			) : null}
		</div>
	);
}

type InputType =
	| "TEAM_NAME"
	| "REGISTERED_TEAM"
	| "USER"
	| "ROSTER_MEMBER"
	| "BRACKET"
	| "IN_GAME_NAME";
const actions = [
	{
		type: "ADD_TEAM",
		inputs: ["USER", "TEAM_NAME"] as InputType[],
		when: ["TOURNAMENT_BEFORE_START"],
	},
	{
		type: "CHANGE_TEAM_NAME",
		inputs: ["REGISTERED_TEAM", "TEAM_NAME"] as InputType[],
		when: [],
	},
	{
		type: "CHANGE_TEAM_OWNER",
		inputs: ["ROSTER_MEMBER", "REGISTERED_TEAM"] as InputType[],
		when: [],
	},
	{
		type: "CHECK_IN",
		inputs: ["REGISTERED_TEAM", "BRACKET"] as InputType[],
		when: ["CHECK_IN_STARTED"],
	},
	{
		type: "CHECK_OUT",
		inputs: ["REGISTERED_TEAM", "BRACKET"] as InputType[],
		when: ["CHECK_IN_STARTED"],
	},
	{
		type: "ADD_MEMBER",
		inputs: ["USER", "REGISTERED_TEAM"] as InputType[],
		when: [],
	},
	{
		type: "REMOVE_MEMBER",
		inputs: ["ROSTER_MEMBER", "REGISTERED_TEAM"] as InputType[],
		when: [],
	},
	{
		type: "DELETE_TEAM",
		inputs: ["REGISTERED_TEAM"] as InputType[],
		when: ["TOURNAMENT_BEFORE_START"],
	},
	{
		type: "DROP_TEAM_OUT",
		inputs: ["REGISTERED_TEAM"] as InputType[],
		when: ["TOURNAMENT_AFTER_START", "IS_SWISS"],
	},
	{
		type: "UNDO_DROP_TEAM_OUT",
		inputs: ["REGISTERED_TEAM"] as InputType[],
		when: ["TOURNAMENT_AFTER_START", "IS_SWISS"],
	},
	{
		type: "UPDATE_IN_GAME_NAME",
		inputs: ["ROSTER_MEMBER", "REGISTERED_TEAM", "IN_GAME_NAME"] as InputType[],
		when: ["IN_GAME_NAME_REQUIRED"],
	},
	{
		type: "DELETE_LOGO",
		inputs: ["REGISTERED_TEAM"] as InputType[],
		when: [],
	},
] as const;

function TeamActions() {
	const fetcher = useFetcher();
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const [selectedTeamId, setSelectedTeamId] = React.useState(
		tournament.ctx.teams[0]?.id,
	);
	const [selectedAction, setSelectedAction] = React.useState<
		(typeof actions)[number]
	>(
		// if started, default to action with no restrictions
		tournament.hasStarted
			? actions.find((a) => a.when.length === 0)!
			: actions[0],
	);

	const selectedTeam = tournament.teamById(selectedTeamId);

	const actionsToShow = actions.filter((action) => {
		for (const when of action.when) {
			switch (when) {
				case "CHECK_IN_STARTED": {
					if (!tournament.regularCheckInStartInThePast) {
						return false;
					}

					break;
				}
				case "TOURNAMENT_BEFORE_START": {
					if (tournament.hasStarted) {
						return false;
					}

					break;
				}
				case "TOURNAMENT_AFTER_START": {
					if (!tournament.hasStarted) {
						return false;
					}

					break;
				}
				case "IS_SWISS": {
					if (!tournament.brackets.some((b) => b.type === "swiss")) {
						return false;
					}

					break;
				}
				case "IN_GAME_NAME_REQUIRED": {
					if (!tournament.ctx.settings.requireInGameNames) {
						return false;
					}

					break;
				}
				default: {
					assertUnreachable(when);
				}
			}
		}

		return true;
	});

	return (
		<div className="stack md">
			<fetcher.Form
				method="post"
				className="stack horizontal sm items-end flex-wrap"
			>
				<div>
					<label htmlFor="action">Action</label>
					<select
						id="action"
						name="action"
						value={selectedAction.type}
						onChange={(e) => {
							setSelectedAction(
								actions.find((a) => a.type === e.target.value)!,
							);
						}}
					>
						{actionsToShow.map((action) => (
							<option key={action.type} value={action.type}>
								{t(`tournament:admin.actions.${action.type}`)}
							</option>
						))}
					</select>
				</div>
				{selectedAction.inputs.includes("REGISTERED_TEAM") ? (
					<div>
						<label htmlFor="teamId">Team</label>
						<select
							id="teamId"
							name="teamId"
							value={selectedTeamId}
							onChange={(e) => setSelectedTeamId(Number(e.target.value))}
						>
							{tournament.ctx.teams
								.slice()
								.sort((a, b) => a.name.localeCompare(b.name))
								.map((team) => (
									<option key={team.id} value={team.id}>
										{team.name}
									</option>
								))}
						</select>
					</div>
				) : null}
				{selectedAction.inputs.includes("TEAM_NAME") ? (
					<div>
						<label htmlFor="teamName">Team name</label>
						<input id="teamName" name="teamName" />
					</div>
				) : null}
				{selectedTeam && selectedAction.inputs.includes("ROSTER_MEMBER") ? (
					<div>
						<label htmlFor="memberId">Member</label>
						<select id="memberId" name="memberId">
							{selectedTeam.members.map((member) => (
								<option key={member.userId} value={member.userId}>
									{member.username}
								</option>
							))}
						</select>
					</div>
				) : null}
				{selectedAction.inputs.includes("USER") ? (
					<div>
						<label htmlFor="user">User</label>
						<UserSearch inputName="userId" id="user" />
					</div>
				) : null}
				{selectedAction.inputs.includes("BRACKET") ? (
					<div>
						<label htmlFor="bracket">Bracket</label>
						<select id="bracket" name="bracketIdx">
							{tournament.brackets.map((bracket, bracketIdx) => (
								<option key={bracket.name} value={bracketIdx}>
									{bracket.name}
								</option>
							))}
						</select>
					</div>
				) : null}
				{selectedTeam && selectedAction.inputs.includes("IN_GAME_NAME") ? (
					<div className="stack items-start">
						<Label>New IGN</Label>
						<div className="stack horizontal sm items-center">
							<Input
								name="inGameNameText"
								aria-label="In game name"
								maxLength={USER.IN_GAME_NAME_TEXT_MAX_LENGTH}
							/>
							<div className="u-edit__in-game-name-hashtag">#</div>
							<Input
								name="inGameNameDiscriminator"
								aria-label="In game name discriminator"
								maxLength={USER.IN_GAME_NAME_DISCRIMINATOR_MAX_LENGTH}
								pattern="[0-9a-z]{4,5}"
							/>
						</div>
					</div>
				) : null}
				<SubmitButton
					_action={selectedAction.type}
					state={fetcher.state}
					variant={
						selectedAction.type === "DELETE_TEAM" ? "destructive" : undefined
					}
				>
					Go
				</SubmitButton>
			</fetcher.Form>
		</div>
	);
}

function Staff() {
	const tournament = useTournament();

	return (
		<div className="stack lg">
			{/* Key so inputs are cleared after staff is added */}
			<StaffAdder key={tournament.ctx.staff.length} />
			<StaffList />
		</div>
	);
}

function CastTwitchAccounts() {
	const id = React.useId();
	const fetcher = useFetcher();
	const tournament = useTournament();

	return (
		<fetcher.Form method="post" className="stack sm">
			<div className="stack horizontal sm items-end">
				<div>
					<Label htmlFor={id}>Twitch accounts</Label>
					<input
						id={id}
						placeholder="dappleproductions"
						name="castTwitchAccounts"
						defaultValue={tournament.ctx.castTwitchAccounts?.join(",")}
					/>
				</div>
				<SubmitButton
					testId="save-cast-twitch-accounts-button"
					state={fetcher.state}
					_action="UPDATE_CAST_TWITCH_ACCOUNTS"
				>
					Save
				</SubmitButton>
			</div>
			<FormMessage type="info">
				Twitch account where the tournament is casted. Player streams are added
				automatically based on their profile data. You can also enter multiple
				accounts, just separate them with a comma e.g.
				&quot;sendouc,leanny&quot;
			</FormMessage>
		</fetcher.Form>
	);
}

function StaffAdder() {
	const fetcher = useFetcher();
	const tournament = useTournament();

	return (
		<fetcher.Form method="post" className="stack sm">
			<div className="stack horizontal sm flex-wrap items-end">
				<div>
					<Label htmlFor="staff-user">New staffer</Label>
					<UserSearch
						inputName="userId"
						id="staff-user"
						required
						userIdsToOmit={
							new Set([
								tournament.ctx.author.id,
								...tournament.ctx.staff.map((s) => s.id),
							])
						}
					/>
				</div>
				<div>
					<Label htmlFor="staff-role">Role</Label>
					<select name="role" id="staff-role" className="w-max">
						<option value="ORGANIZER">Organizer</option>
						<option value="STREAMER">Streamer</option>
					</select>
				</div>
				<SubmitButton
					state={fetcher.state}
					_action="ADD_STAFF"
					testId="add-staff-button"
				>
					Add
				</SubmitButton>
			</div>
			<FormMessage type="info">
				Organizer has same permissions as you expect adding/removing staff,
				editing calendar event info and deleting the tournament. Streamer can
				only talk in chats and see room password/pool.
			</FormMessage>
		</fetcher.Form>
	);
}

function StaffList() {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	return (
		<div className="stack md">
			{tournament.ctx.staff.map((staff) => (
				<div
					key={staff.id}
					className="stack horizontal sm items-center"
					data-testid={`staff-id-${staff.id}`}
				>
					<Avatar size="xs" user={staff} />{" "}
					<div className="mr-4">
						<div>{staff.username}</div>
						<div className="text-lighter text-xs text-capitalize">
							{t(`tournament:staff.role.${staff.role}`)}
						</div>
					</div>
					<RemoveStaffButton staff={staff} />
				</div>
			))}
		</div>
	);
}

function RemoveStaffButton({
	staff,
}: {
	staff: TournamentData["ctx"]["staff"][number];
}) {
	const { t } = useTranslation(["tournament"]);

	return (
		<FormWithConfirm
			dialogHeading={`Remove ${staff.username} as ${t(
				`tournament:staff.role.${staff.role}`,
			)}?`}
			fields={[
				["userId", staff.id],
				["_action", "REMOVE_STAFF"],
			]}
			deleteButtonText="Remove"
		>
			<Button
				variant="minimal-destructive"
				size="tiny"
				data-testid="remove-staff-button"
			>
				<TrashIcon className="build__icon" />
			</Button>
		</FormWithConfirm>
	);
}

function DownloadParticipants() {
	const tournament = useTournament();

	function allParticipantsContent() {
		return tournament.ctx.teams
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((team) => {
				const owner = team.members.find((user) => user.isOwner);
				invariant(owner);

				const nonOwners = team.members.filter((user) => !user.isOwner);

				let result = `-- ${team.name} --\n(C) ${owner.username} (IGN: ${owner.inGameName ?? ""}) - <@${owner.discordId}>`;

				result += nonOwners
					.map(
						(user) =>
							`\n${user.username} (IGN: ${user.inGameName ?? ""}) - <@${user.discordId}>`,
					)
					.join("");

				result += "\n";

				return result;
			})
			.join("\n");
	}

	function checkedInParticipantsContent() {
		const header = "Teams ordered by registration time\n---\n";

		return (
			header +
			tournament.ctx.teams
				.slice()
				.sort((a, b) => a.createdAt - b.createdAt)
				.filter((team) => team.checkIns.length > 0)
				.map((team, i) => {
					return `${i + 1}) ${team.name} - ${databaseTimestampToDate(
						team.createdAt,
					).toISOString()} - ${team.members
						.map((member) => `${member.username} - <@${member.discordId}>`)
						.join(" / ")}`;
				})
				.join("\n")
		);
	}

	function notCheckedInParticipantsContent() {
		return tournament.ctx.teams
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.filter((team) => team.checkIns.length === 0)
			.map((team) => {
				return `${team.name} - ${team.members
					.map((member) => `${member.username} - <@${member.discordId}>`)
					.join(" / ")}`;
			})
			.join("\n");
	}

	function simpleListInSeededOrder() {
		return tournament.ctx.teams
			.slice()
			.sort(
				(a, b) =>
					(a.seed ?? Number.POSITIVE_INFINITY) -
					(b.seed ?? Number.POSITIVE_INFINITY),
			)
			.filter((team) => team.checkIns.length > 0)
			.map((team) => team.name)
			.join("\n");
	}

	function leagueFormat() {
		const memberColumnsCount = tournament.ctx.teams.reduce(
			(max, team) => Math.max(max, team.members.length),
			0,
		);
		const header = `Team id,Team name,Team page URL,Div${Array.from({
			length: memberColumnsCount,
		})
			.map((_, i) => `,Member ${i + 1} name,Member${i + 1} URL`)
			.join("")}`;

		return `${header}\n${tournament.ctx.teams
			.map((team) => {
				return `${team.id},${team.name},${team.team ? teamPage(team.team.customUrl) : ""},,${team.members
					.map(
						(member) =>
							`${member.username},https://sendou.ink/u/${member.discordId}`,
					)
					.join(",")}${Array(
					memberColumnsCount - team.members.length === 0
						? 0
						: memberColumnsCount - team.members.length + 1,
				)
					.fill(",")
					.join("")}`;
			})
			.join("\n")}`;
	}

	return (
		<div>
			<div className="stack horizontal sm flex-wrap">
				<Button
					size="tiny"
					onClick={() =>
						handleDownload({
							filename: "all-participants.txt",
							content: allParticipantsContent(),
						})
					}
				>
					All participants
				</Button>
				<Button
					size="tiny"
					onClick={() =>
						handleDownload({
							filename: "checked-in-participants.txt",
							content: checkedInParticipantsContent(),
						})
					}
				>
					Checked in participants
				</Button>
				<Button
					size="tiny"
					onClick={() =>
						handleDownload({
							filename: "not-checked-in-participants.txt",
							content: notCheckedInParticipantsContent(),
						})
					}
				>
					Not checked in participants
				</Button>
				<Button
					size="tiny"
					onClick={() =>
						handleDownload({
							filename: "teams-in-seeded-order.txt",
							content: simpleListInSeededOrder(),
						})
					}
				>
					Simple list in seeded order
				</Button>
				{tournament.isLeagueSignup ? (
					<Button
						size="tiny"
						onClick={() =>
							handleDownload({
								filename: "league-format.csv",
								content: leagueFormat(),
							})
						}
					>
						League format
					</Button>
				) : null}
			</div>
		</div>
	);
}

function handleDownload({
	content,
	filename,
}: {
	content: string;
	filename: string;
}) {
	const element = document.createElement("a");
	const file = new Blob([content], {
		type: "text/plain",
	});
	element.href = URL.createObjectURL(file);
	element.download = filename;
	document.body.appendChild(element);
	element.click();
}

function BracketReset() {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const inProgressBrackets = tournament.brackets.filter((b) => !b.preview);
	const [_bracketToDelete, setBracketToDelete] = React.useState(
		inProgressBrackets[0]?.id,
	);
	const [confirmText, setConfirmText] = React.useState("");

	if (inProgressBrackets.length === 0) {
		return <div className="text-lighter text-sm">No brackets in progress</div>;
	}

	const bracketToDelete = _bracketToDelete ?? inProgressBrackets[0].id;

	const bracketToDeleteName = inProgressBrackets.find(
		(bracket) => bracket.id === bracketToDelete,
	)?.name;

	return (
		<div>
			<fetcher.Form method="post" className="stack horizontal sm items-end">
				<div>
					<label htmlFor="bracket">Bracket</label>
					<select
						id="bracket"
						name="stageId"
						value={bracketToDelete}
						onChange={(e) => setBracketToDelete(Number(e.target.value))}
					>
						{inProgressBrackets.map((bracket) => (
							<option key={bracket.name} value={bracket.id}>
								{bracket.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="bracket-confirmation">
						Type bracket name (&quot;{bracketToDeleteName}&quot;) to confirm
					</label>
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						id="bracket-confirmation"
						disableAutoComplete
					/>
				</div>
				<SubmitButton
					_action="RESET_BRACKET"
					state={fetcher.state}
					disabled={confirmText !== bracketToDeleteName}
					testId="reset-bracket-button"
				>
					Reset
				</SubmitButton>
			</fetcher.Form>
			<FormMessage type="error" className="mt-2">
				Resetting a bracket will delete all the match results in it (but not
				other brackets) and reset the bracket to its initial state allowing you
				to change participating teams.
			</FormMessage>
		</div>
	);
}

function BracketProgressionEditDialog({ close }: { close: () => void }) {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [bracketProgressionErrored, setBracketProgressionErrored] =
		React.useState(false);

	const disabledBracketIdxs = tournament.brackets
		.filter((bracket) => !bracket.preview)
		.map((bracket) => bracket.idx);

	return (
		<Dialog isOpen className="w-max">
			<fetcher.Form method="post">
				<BracketProgressionSelector
					initialBrackets={Progression.validatedBracketsToInputFormat(
						tournament.ctx.settings.bracketProgression,
					).map((bracket, idx) => ({
						...bracket,
						disabled: disabledBracketIdxs.includes(idx),
					}))}
					isInvitationalTournament={tournament.isInvitational}
					setErrored={setBracketProgressionErrored}
					isTournamentInProgress
				/>
				<div className="stack md horizontal justify-center mt-6">
					<SubmitButton
						_action="UPDATE_TOURNAMENT_PROGRESSION"
						disabled={bracketProgressionErrored}
					>
						Save changes
					</SubmitButton>
					<Button variant="destructive" onClick={close}>
						Cancel
					</Button>
				</div>
			</fetcher.Form>
		</Dialog>
	);
}

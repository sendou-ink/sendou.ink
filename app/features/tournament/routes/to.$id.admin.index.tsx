import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { USER } from "~/features/user-page/user-page-constants";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import { teamPage } from "~/utils/urls";
import { useTournament } from "./to.$id";
import styles from "./to.$id.admin.index.module.css";

export { action } from "../actions/to.$id.admin.index.server";

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
		when: ["TOURNAMENT_AFTER_START"],
	},
	{
		type: "UNDO_DROP_TEAM_OUT",
		inputs: ["REGISTERED_TEAM"] as InputType[],
		when: ["TOURNAMENT_AFTER_START"],
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

export default function TournamentAdminTeamsPage() {
	return (
		<div className="stack lg">
			<TeamActions />
			<Divider smallText>Participant list download</Divider>
			<DownloadParticipants />
		</div>
	);
}

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
				className={clsx(
					"stack horizontal sm items-end flex-wrap",
					styles.actionForm,
				)}
			>
				<div className="flex-same-size">
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
					<div className="flex-same-size">
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
					<div className="flex-same-size">
						<label htmlFor="teamName">Team name</label>
						<input id="teamName" name="teamName" />
					</div>
				) : null}
				{selectedTeam && selectedAction.inputs.includes("ROSTER_MEMBER") ? (
					<div className="flex-same-size">
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
					<div className="flex-same-size">
						<UserSearch name="userId" label="User" />
					</div>
				) : null}
				{selectedAction.inputs.includes("BRACKET") ? (
					<div className="flex-same-size">
						<label htmlFor="bracket">Bracket</label>
						<select id="bracket" name="bracketIdx">
							{tournament.brackets.map((bracket, bracketIdx) => (
								<option
									key={bracket.name}
									value={
										// no sources means it's a starting bracket
										// in terms of check out and check in
										// bracket idx = 0 refers to the check-in for the tournament as a whole
										!bracket.sources || bracket.sources.length === 0
											? 0
											: bracketIdx
									}
								>
									{bracket.name}
								</option>
							))}
						</select>
					</div>
				) : null}
				{selectedTeam && selectedAction.inputs.includes("IN_GAME_NAME") ? (
					<div className="stack items-start flex-same-size">
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

function DownloadParticipants() {
	const tournament = useTournament();

	function allParticipantsContent() {
		return tournament.ctx.teams
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((team) => {
				const owner = team.members.find((user) => user.role === "OWNER");
				invariant(owner);

				const nonOwners = team.members.filter((user) => user.role !== "OWNER");

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
		const hasCheckedInTeams = tournament.ctx.teams.some(
			(team) => team.checkIns.length > 0,
		);

		return tournament.ctx.teams
			.slice()
			.sort(
				(a, b) =>
					(a.seed ?? Number.POSITIVE_INFINITY) -
					(b.seed ?? Number.POSITIVE_INFINITY),
			)
			.filter((team) => !hasCheckedInTeams || team.checkIns.length > 0)
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
				<SendouButton
					size="small"
					onPress={() =>
						handleDownload({
							filename: "all-participants.txt",
							content: allParticipantsContent(),
						})
					}
				>
					All participants
				</SendouButton>
				<SendouButton
					size="small"
					onPress={() =>
						handleDownload({
							filename: "checked-in-participants.txt",
							content: checkedInParticipantsContent(),
						})
					}
				>
					Checked in participants
				</SendouButton>
				<SendouButton
					size="small"
					onPress={() =>
						handleDownload({
							filename: "not-checked-in-participants.txt",
							content: notCheckedInParticipantsContent(),
						})
					}
				>
					Not checked in participants
				</SendouButton>
				<SendouButton
					size="small"
					onPress={() =>
						handleDownload({
							filename: "teams-in-seeded-order.txt",
							content: simpleListInSeededOrder(),
						})
					}
				>
					Simple list in seeded order
				</SendouButton>
				{tournament.isLeagueSignup ? (
					<SendouButton
						size="small"
						onPress={() =>
							handleDownload({
								filename: "league-format.csv",
								content: leagueFormat(),
							})
						}
					>
						League format
					</SendouButton>
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

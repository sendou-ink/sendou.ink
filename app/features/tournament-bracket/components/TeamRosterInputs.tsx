import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import { tournamentTeamPage, userPage } from "~/utils/urls";
import { useTournament } from "../../tournament/routes/to.$id";
import type { TournamentDataTeam } from "../core/Tournament.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "../tournament-bracket.module.css";
import { tournamentTeamToActiveRosterUserIds } from "../tournament-bracket-utils";
import type { Result } from "./StartedMatch";

/** Inputs to select who played for teams in a match as well as the winner. Can also be used in a presentational way. */
export function TeamRosterInputs({
	teams,
	winnerId,
	setWinnerId,
	checkedPlayers,
	setCheckedPlayers,
	points: _points,
	setPoints,
	result,
	revising,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
	winnerId?: number | null;
	checkedPlayers: [number[], number[]];
	setCheckedPlayers?: React.Dispatch<
		React.SetStateAction<[number[], number[]]>
	>;
	points?: [number, number];
	setWinnerId: (newId?: number) => void;
	setPoints: React.Dispatch<React.SetStateAction<[number, number]>>;
	result?: Result;
	revising?: boolean;
}) {
	const tournament = useTournament();

	const presentational = !revising && Boolean(result);

	const points =
		typeof result?.opponentOnePoints === "number" &&
		typeof result?.opponentTwoPoints === "number" &&
		!revising
			? ([result.opponentOnePoints, result.opponentTwoPoints] as [
					number,
					number,
				])
			: _points;

	return (
		<div className={styles.duringMatchActionsRosters}>
			{teams.map((team, teamI) => {
				const winnerRadioChecked = result
					? result.winnerTeamId === team.id
					: winnerId === team.id;

				return (
					<TeamRoster
						key={team.id}
						idx={teamI}
						setPoints={setPoints}
						presentational={presentational}
						team={team}
						bothTeamsHaveActiveRosters={teams.every((team) =>
							tournamentTeamToActiveRosterUserIds(
								team,
								tournament.minMembersPerTeam,
							),
						)}
						setWinnerId={setWinnerId}
						setCheckedPlayers={setCheckedPlayers}
						checkedPlayers={checkedPlayers[teamI].join(",")}
						winnerRadioChecked={winnerRadioChecked}
						points={points ? points[teamI] : undefined}
						result={result}
						revising={revising}
					/>
				);
			})}
		</div>
	);
}

function TeamRoster({
	team,
	bothTeamsHaveActiveRosters,
	presentational,
	idx,
	setWinnerId,
	setPoints,
	setCheckedPlayers,
	points,
	winnerRadioChecked,
	checkedPlayers,
	result,
	revising,
}: {
	team: TournamentDataTeam;
	bothTeamsHaveActiveRosters: boolean;
	presentational: boolean;
	idx: number;
	setWinnerId: (newId?: number) => void;
	setPoints: React.Dispatch<React.SetStateAction<[number, number]>>;
	setCheckedPlayers?: React.Dispatch<
		React.SetStateAction<[number[], number[]]>
	>;
	points?: number;
	winnerRadioChecked: boolean;
	checkedPlayers: string;
	result?: Result;
	revising?: boolean;
}) {
	const tournament = useTournament();
	const activeRoster = tournamentTeamToActiveRosterUserIds(
		team,
		tournament.minMembersPerTeam,
	);

	const user = useUser();

	const canEditRoster =
		(team.members.some((member) => member.userId === user?.id) ||
			tournament.isOrganizer(user)) &&
		!presentational &&
		team.members.length > tournament.minMembersPerTeam;
	const [_editingRoster, _setEditingRoster] = React.useState(
		!activeRoster && canEditRoster,
	);

	const editingRoster = revising || _editingRoster;

	const setEditingRoster = (editing: boolean) => {
		const didCancel = !editing;
		if (didCancel) {
			setCheckedPlayers?.((oldPlayers) => {
				const newPlayers = structuredClone(oldPlayers);
				newPlayers[idx] = activeRoster ?? [];
				return newPlayers;
			});
		}

		_setEditingRoster(editing);
	};

	const hasPoints = typeof points === "number";

	// just so we can center the points nicely
	const showWinnerRadio = !hasPoints || !presentational || winnerRadioChecked;

	const onPointsChange = React.useCallback(
		(newPoint: number) => {
			setPoints((points) => {
				const newPoints = structuredClone(points);
				newPoints[idx] = newPoint;
				return newPoints;
			});
		},
		[idx, setPoints],
	);

	const checkedInputPlayerIds = () => {
		if (result?.participants && !revising) {
			return result.participants
				.filter(
					(participant) =>
						!participant.tournamentTeamId ||
						participant.tournamentTeamId === team.id,
				)
				.map((participant) => participant.userId);
		}
		if (editingRoster) return checkedPlayers.split(",").map(Number);

		return activeRoster ?? [];
	};

	const checkedPlayersArray = checkedPlayers.split(",").map(Number);

	return (
		<div key={team.id}>
			<TeamRosterHeader
				idx={idx}
				team={team}
				tournamentId={tournament.ctx.id}
			/>
			<div className="stack horizontal md justify-center mt-1">
				{showWinnerRadio ? (
					<WinnerRadio
						presentational={presentational || Boolean(revising)}
						checked={winnerRadioChecked}
						teamId={team.id}
						onChange={() => setWinnerId?.(team.id)}
						team={idx + 1}
						invisible={!bothTeamsHaveActiveRosters}
					/>
				) : null}
				{hasPoints ? (
					<PointInput
						value={points}
						onChange={onPointsChange}
						presentational={presentational}
						disabled={!bothTeamsHaveActiveRosters}
						testId={`points-input-${idx + 1}`}
					/>
				) : null}
			</div>
			<TeamRosterInputsCheckboxes
				teamId={team.id}
				checkedPlayers={checkedInputPlayerIds()}
				presentational={!revising && (presentational || !editingRoster)}
				handlePlayerClick={(playerId) => {
					if (!setCheckedPlayers) return;

					setCheckedPlayers((oldPlayers) => {
						const newPlayers = structuredClone(oldPlayers);
						if (oldPlayers[idx].includes(playerId)) {
							newPlayers[idx] = newPlayers[idx].filter((id) => id !== playerId);
						} else {
							newPlayers[idx].push(playerId);
						}

						return newPlayers;
					});
				}}
			/>
			{!revising && canEditRoster ? (
				<RosterFormWithButtons
					editingRoster={editingRoster}
					setEditingRoster={setEditingRoster}
					showCancelButton={Boolean(activeRoster)}
					checkedPlayers={checkedPlayersArray}
					teamId={team.id}
					valid={checkedPlayersArray.length === tournament.minMembersPerTeam}
				/>
			) : null}
		</div>
	);
}

function TeamRosterHeader({
	idx,
	team,
	tournamentId,
}: {
	idx: number;
	team: TournamentDataTeam;
	tournamentId: number;
}) {
	return (
		<>
			<div className="text-xs text-lighter font-semi-bold stack horizontal xs items-center justify-center">
				<div className={idx === 0 ? styles.teamOneDot : styles.teamTwoDot} />
				Team {idx + 1}
			</div>
			<h4>
				{team.seed ? (
					<span className={styles.duringMatchActionsSeed}>#{team.seed}</span>
				) : null}{" "}
				<Link
					to={tournamentTeamPage({
						tournamentId,
						tournamentTeamId: team.id,
					})}
					className={styles.duringMatchActionsTeamName}
				>
					{team.name}
				</Link>
			</h4>
		</>
	);
}

/** Renders radio button to select the winner, or in presentational mode just displays the text "Winner" */
function WinnerRadio({
	presentational,
	teamId,
	checked,
	onChange,
	team,
	invisible,
}: {
	presentational: boolean;
	teamId: number;
	checked: boolean;
	onChange: () => void;
	team: number;
	invisible: boolean;
}) {
	const id = React.useId();

	if (presentational) {
		return (
			<div
				className={clsx("text-xs font-bold stack justify-center", {
					invisible: !checked,
					"text-theme": team === 1,
					"text-theme-secondary": team === 2,
				})}
			>
				Winner
			</div>
		);
	}

	return (
		<div
			className={clsx(styles.duringMatchActionsRadioContainer, {
				invisible,
			})}
		>
			<input
				type="radio"
				id={`${teamId}-${id}`}
				onChange={onChange}
				checked={checked}
				data-testid={`winner-radio-${team}`}
			/>
			<Label className="mb-0 ml-2" htmlFor={`${teamId}-${id}`}>
				Winner
			</Label>
		</div>
	);
}

function PointInput({
	value,
	onChange,
	presentational,
	disabled,
	testId,
}: {
	value: number;
	onChange: (newPoint: number) => void;
	presentational: boolean;
	disabled: boolean;
	testId?: string;
}) {
	const [focused, setFocused] = React.useState(false);
	const id = React.useId();

	if (presentational) {
		return (
			<div className="text-xs text-lighter">
				{value === 100 ? "KO" : <>{value}p</>}
			</div>
		);
	}

	return (
		<div className="stack horizontal sm items-center">
			<input
				className={styles.pointsInput}
				onChange={(e) => onChange(Number(e.target.value))}
				type="number"
				min={0}
				max={100}
				disabled={disabled}
				value={focused && !value ? "" : String(value)}
				required
				id={id}
				data-testid={testId}
				pattern="[0-9]*"
				inputMode="numeric"
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
			/>
			<Label
				htmlFor={id}
				spaced={false}
				className={clsx({ "text-lighter": disabled })}
			>
				Score
			</Label>
		</div>
	);
}

function TeamRosterInputsCheckboxes({
	teamId,
	checkedPlayers,
	handlePlayerClick,
	presentational,
}: {
	teamId: number;
	checkedPlayers: number[];
	handlePlayerClick: (playerId: number) => void;
	presentational: boolean;
}) {
	const data = useLoaderData<TournamentMatchLoaderData>();
	const id = React.useId();
	const tournament = useTournament();

	const members = data.match.players.filter(
		(p) => p.tournamentTeamId === teamId,
	);

	const mode = () => {
		if (presentational) return "PRESENTATIONAL";

		// Disabled in this case because we expect a result to have exactly
		// TOURNAMENT_TEAM_ROSTER_MIN_SIZE members per team when reporting it
		// so there is no point to let user to change them around
		if (members.length <= tournament.minMembersPerTeam) {
			return "DISABLED";
		}

		return "DEFAULT";
	};

	return (
		<div className={styles.duringMatchActionsTeamPlayers}>
			{members.map((member, i) => {
				return (
					<div className="stack horizontal xs" key={member.id}>
						<div
							className={clsx(
								styles.duringMatchActionsCheckboxName,
								{ "disabled-opaque": mode() === "DISABLED" },
								{ presentational: mode() === "PRESENTATIONAL" },
							)}
						>
							<input
								className={clsx(styles.duringMatchActionsCheckbox, {
									opaque: presentational,
								})}
								type="checkbox"
								id={`${member.id}-${id}`}
								name="playerName"
								disabled={mode() === "DISABLED" || mode() === "PRESENTATIONAL"}
								value={member.id}
								checked={checkedPlayers.includes(member.id)}
								onChange={() => handlePlayerClick(member.id)}
								data-testid={`player-checkbox-${i}`}
							/>{" "}
							<label
								className={styles.duringMatchActionsPlayerName}
								htmlFor={`${member.id}-${id}`}
							>
								<span className={styles.duringMatchActionsPlayerNameInner}>
									{member.inGameName
										? inGameNameWithoutDiscriminator(member.inGameName)
										: member.username}
								</span>
							</label>
						</div>
						<Link to={userPage(member)}>
							<Avatar size="xxs" user={member} />
						</Link>
					</div>
				);
			})}
		</div>
	);
}

function RosterFormWithButtons({
	editingRoster,
	setEditingRoster,
	showCancelButton,
	checkedPlayers,
	teamId,
	valid,
}: {
	editingRoster: boolean;
	setEditingRoster: (editing: boolean) => void;
	showCancelButton?: boolean;
	checkedPlayers: number[];
	teamId: number;
	valid: boolean;
}) {
	const fetcher = useFetcher();

	if (!editingRoster) {
		return (
			<div className={styles.rosterButtonsContainer}>
				<SendouButton
					size="small"
					onPress={() => setEditingRoster(true)}
					className={styles.editRosterButton}
					variant="minimal"
					data-testid="edit-active-roster-button"
				>
					Edit active roster
				</SendouButton>
			</div>
		);
	}

	return (
		<fetcher.Form method="post" className={styles.rosterButtonsContainer}>
			<input
				type="hidden"
				name="roster"
				value={JSON.stringify(checkedPlayers)}
			/>
			<input type="hidden" name="teamId" value={teamId} />
			<SubmitButton
				state={fetcher.state}
				size="small"
				_action="SET_ACTIVE_ROSTER"
				isDisabled={!valid}
				testId="save-active-roster-button"
			>
				Save
			</SubmitButton>
			{showCancelButton ? (
				<SendouButton
					size="small"
					variant="destructive"
					onPress={() => {
						setEditingRoster(false);
					}}
				>
					Cancel
				</SendouButton>
			) : null}
		</fetcher.Form>
	);
}

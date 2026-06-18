import * as React from "react";
import { useFetcher } from "react-router";
import { Divider } from "~/components/Divider";
import { FormMessage } from "~/components/FormMessage";
import { Input } from "~/components/Input";
import { Redirect } from "~/components/Redirect";
import { SubmitButton } from "~/components/SubmitButton";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { tournamentAdminPage } from "~/utils/urls";
import { BracketProgressionSelector } from "../../calendar/components/BracketProgressionSelector";

export { action } from "../actions/to.$id.admin.brackets.server";

export default function TournamentAdminBracketsPage() {
	const tournament = useTournament();
	const user = useUser();

	const showReopen = Boolean(
		DANGEROUS_CAN_ACCESS_DEV_CONTROLS &&
			tournament.ctx.isFinalized &&
			tournament.isAdmin(user),
	);
	const showEditBrackets =
		tournament.isAdmin(user) &&
		tournament.hasStarted &&
		!tournament.ctx.isFinalized;

	if (tournament.ctx.isFinalized && !showReopen) {
		return <Redirect to={tournamentAdminPage(tournament.ctx.id)} />;
	}

	return (
		<div className="stack lg">
			{showEditBrackets ? (
				<>
					<Divider smallText>Edit brackets</Divider>
					<BracketProgressionEdit />
				</>
			) : null}
			{!tournament.isLeagueSignup ? (
				<>
					<Divider smallText>Bracket reset</Divider>
					<BracketReset />
				</>
			) : null}
			{showReopen ? (
				<>
					<Divider smallText>Reopen tournament (dev only)</Divider>
					<ReopenTournament />
				</>
			) : null}
		</div>
	);
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
				<div className="flex-same-size">
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
				<div className="flex-same-size">
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
					isDisabled={confirmText !== bracketToDeleteName}
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

function BracketProgressionEdit() {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [bracketProgressionErrored, setBracketProgressionErrored] =
		React.useState(false);

	const disabledBracketIdxs = tournament.brackets
		.filter((bracket) => !bracket.preview)
		.map((bracket) => bracket.idx);

	return (
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
					isDisabled={bracketProgressionErrored}
				>
					Save changes
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function ReopenTournament() {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [confirmText, setConfirmText] = React.useState("");

	return (
		<div>
			<fetcher.Form method="post" className="stack horizontal sm items-end">
				<div className="flex-same-size">
					<label htmlFor="reopen-confirmation">
						Type tournament name (&quot;{tournament.ctx.name}&quot;) to confirm
					</label>
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						id="reopen-confirmation"
						disableAutoComplete
					/>
				</div>
				<SubmitButton
					_action="REOPEN_TOURNAMENT"
					state={fetcher.state}
					isDisabled={confirmText !== tournament.ctx.name}
					variant="destructive"
					testId="reopen-tournament-button"
				>
					Reopen
				</SubmitButton>
			</fetcher.Form>
			<FormMessage type="error" className="mt-2">
				Reopening a tournament will delete all results, skill calculations, and
				badges awarded from this tournament. Use this to test finalization
				multiple times.
			</FormMessage>
		</div>
	);
}

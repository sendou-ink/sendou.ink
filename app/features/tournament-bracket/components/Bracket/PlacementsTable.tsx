import { Link, useFetcher } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Button } from "../../../../components/Button";
import { CheckmarkIcon } from "../../../../components/icons/Checkmark";
import { CrossIcon } from "../../../../components/icons/Cross";
import { EditIcon } from "../../../../components/icons/Edit";
import { logger } from "../../../../utils/logger";
import { tournamentTeamPage } from "../../../../utils/urls";
import { useUser } from "../../../auth/core/user";
import type { Bracket } from "../../core/Bracket";
import * as Progression from "../../core/Progression";

export function PlacementsTable({
	groupId,
	bracket,
	allMatchesFinished,
}: {
	groupId: number;
	bracket: Bracket;
	allMatchesFinished: boolean;
}) {
	const user = useUser();

	const _standings = bracket
		.currentStandings(true)
		.filter((s) => s.groupId === groupId);

	const missingTeams = bracket.data.match.reduce((acc, cur) => {
		if (cur.group_id !== groupId) return acc;

		if (
			cur.opponent1?.id &&
			!_standings.some((s) => s.team.id === cur.opponent1!.id) &&
			!acc.includes(cur.opponent1.id)
		) {
			acc.push(cur.opponent1.id);
		}

		if (
			cur.opponent2?.id &&
			!_standings.some((s) => s.team.id === cur.opponent2!.id) &&
			!acc.includes(cur.opponent2.id)
		) {
			acc.push(cur.opponent2.id);
		}

		return acc;
	}, [] as number[]);

	const standings = _standings
		.concat(
			missingTeams.map((id) => ({
				team: bracket.tournament.teamById(id)!,
				stats: {
					mapLosses: 0,
					mapWins: 0,
					points: 0,
					setLosses: 0,
					setWins: 0,
					winsAgainstTied: 0,
					lossesAgainstTied: 0,
				},
				placement: Math.max(..._standings.map((s) => s.placement)) + 1,
				groupId,
			})),
		)
		.sort((a, b) => {
			if (a.placement === b.placement && a.team.seed && b.team.seed) {
				return a.team.seed - b.team.seed;
			}

			return a.placement - b.placement;
		});

	const destinationBracket = (placement: number) =>
		bracket.tournament.brackets.find(
			(b) =>
				b.idx ===
				Progression.destinationByPlacement({
					sourceBracketIdx: bracket.idx,
					placement,
					progression: bracket.tournament.ctx.settings.bracketProgression,
				}),
		);

	const possibleDestinationBrackets = Progression.destinationsFromBracketIdx(
		bracket.idx,
		bracket.tournament.ctx.settings.bracketProgression,
	).map((idx) => bracket.tournament.bracketByIdx(idx)!);
	const canEditDestination = (() => {
		const allDestinationsPreview = possibleDestinationBrackets.every(
			(b) => b.preview,
		);

		return (
			bracket.tournament.isOrganizer(user) &&
			allDestinationsPreview &&
			allMatchesFinished
		);
	})();

	return (
		<table className="rr__placements-table" cellSpacing={0}>
			<thead>
				<tr>
					<th>Team</th>
					<th>
						<abbr title="Set wins and losses">W/L</abbr>
					</th>
					{bracket.type === "round_robin" ? (
						<th>
							<abbr title="Wins against tied opponents">TB</abbr>
						</th>
					) : null}
					{bracket.type === "swiss" ? (
						<th>
							<abbr title="Losses against tied opponents">TB</abbr>
						</th>
					) : null}
					{bracket.type === "swiss" ? (
						<>
							<th>
								<abbr title="Opponents' set win percentage average">OW%</abbr>
							</th>
							<th>
								<abbr title="Opponents' map win percentage average">
									OW% (M)
								</abbr>
							</th>
						</>
					) : null}
					<th>
						<abbr title="Map wins and losses">W/L (M)</abbr>
					</th>
					{bracket.type === "round_robin" ? (
						<th>
							<abbr title="Score summed up">Scr</abbr>
						</th>
					) : null}
					<th>Seed</th>
					<th />
					{canEditDestination ? <th /> : null}
				</tr>
			</thead>
			<tbody>
				{standings.map((s, i) => {
					const stats = s.stats!;
					if (!stats) {
						logger.error("No stats for team", s.team);
						return null;
					}

					const team = bracket.tournament.teamById(s.team.id);

					const dest = destinationBracket(i + 1);

					const overridenDestination =
						bracket.tournament.ctx.bracketProgressionOverrides.find(
							(override) =>
								override.sourceBracketIdx === bracket.idx &&
								override.tournamentTeamId === s.team.id,
						);
					const overridenDestinationBracket = overridenDestination
						? bracket.tournament.bracketByIdx(
								overridenDestination.destinationBracketIdx,
							)
						: undefined;

					const key = () => {
						if (overridenDestinationBracket === null) {
							return "null";
						}

						return overridenDestinationBracket?.idx;
					};

					return (
						<tr key={s.team.id}>
							<td>
								<Link
									to={tournamentTeamPage({
										tournamentId: bracket.tournament.ctx.id,
										tournamentTeamId: s.team.id,
									})}
								>
									{s.team.name}{" "}
								</Link>
								{s.team.droppedOut ? (
									<span className="text-warning text-xxxs font-bold">
										Drop-out
									</span>
								) : null}
							</td>
							<td>
								<span>
									{stats.setWins}/{stats.setLosses}
								</span>
							</td>
							{bracket.type === "round_robin" ? (
								<td>
									<span>{stats.winsAgainstTied}</span>
								</td>
							) : null}
							{bracket.type === "swiss" ? (
								<td>
									<span>{(stats.lossesAgainstTied ?? 0) * -1}</span>
								</td>
							) : null}
							{bracket.type === "swiss" ? (
								<>
									<td>
										<span>{stats.opponentSetWinPercentage?.toFixed(2)}</span>
									</td>
									<td>
										<span>{stats.opponentMapWinPercentage?.toFixed(2)}</span>
									</td>
								</>
							) : null}
							<td>
								<span>
									{stats.mapWins}/{stats.mapLosses}
								</span>
							</td>
							{bracket.type === "round_robin" ? (
								<td>
									<span>{stats.points}</span>
								</td>
							) : null}
							<td>{team?.seed}</td>
							<EditableDestination
								key={key()}
								source={bracket}
								destination={dest}
								overridenDestination={overridenDestinationBracket}
								possibleDestinations={possibleDestinationBrackets}
								allMatchesFinished={allMatchesFinished}
								canEditDestination={canEditDestination}
								tournamentTeamId={s.team.id}
							/>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function EditableDestination({
	source,
	destination,
	overridenDestination,
	possibleDestinations: _possibleDestinations,
	allMatchesFinished,
	canEditDestination,
	tournamentTeamId,
}: {
	source: Bracket;
	destination?: Bracket;
	overridenDestination?: Bracket | null;
	possibleDestinations: Bracket[];
	allMatchesFinished: boolean;
	canEditDestination: boolean;
	tournamentTeamId: number;
}) {
	const fetcher = useFetcher<any>();
	const [editingDestination, setEditingDestination] = React.useState(false);
	const [newDestinationIdx, setNewDestinationIdx] = React.useState<
		number | null
	>(overridenDestination?.idx ?? destination?.idx ?? -1);

	const handleSubmit = () => {
		fetcher.submit(
			{
				_action: "OVERRIDE_BRACKET_PROGRESSION",
				tournamentTeamId,
				sourceBracketIdx: source.idx,
				destinationBracketIdx: newDestinationIdx,
			},
			{ method: "post", encType: "application/json" },
		);
	};

	const possibleDestinations = [
		"ELIMINATED",
		..._possibleDestinations,
	] as const;

	if (editingDestination) {
		return (
			<>
				<td>
					<select
						value={String(newDestinationIdx)}
						onChange={(e) => setNewDestinationIdx(Number(e.target.value))}
					>
						{possibleDestinations.map((b) => (
							<option
								key={b === "ELIMINATED" ? "ELIMINATED" : b.id}
								value={b === "ELIMINATED" ? -1 : b.idx}
							>
								{b === "ELIMINATED" ? "Eliminated" : b.name}
							</option>
						))}
					</select>
				</td>
				<td>
					<div className="stack horizontal xs">
						<Button
							variant="minimal"
							title="Save destination"
							icon={<CheckmarkIcon />}
							size="tiny"
							onClick={handleSubmit}
						/>
						<Button
							variant="minimal-destructive"
							title="Cancel"
							size="tiny"
							icon={<CrossIcon />}
							onClick={() => setEditingDestination(false)}
						/>
					</div>
				</td>
			</>
		);
	}

	return (
		<>
			{allMatchesFinished &&
			overridenDestination &&
			overridenDestination.idx !== destination?.idx ? (
				<td className="text-theme font-bold">
					<span>→ {overridenDestination.name}</span>
				</td>
			) : destination && overridenDestination !== null ? (
				<td
					className={clsx({
						"italic text-lighter": !allMatchesFinished,
					})}
				>
					<span>→ {destination.name}</span>
				</td>
			) : (
				<td />
			)}
			{canEditDestination ? (
				<td>
					<Button
						variant="minimal"
						title="Edit destination"
						icon={<EditIcon />}
						size="tiny"
						onClick={() => setEditingDestination(true)}
					/>
				</td>
			) : null}
		</>
	);
}

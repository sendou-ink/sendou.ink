import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { UsersIcon } from "~/components/icons/Users";
import { Placement } from "~/components/Placement";
import { Table } from "~/components/Table";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	calendarEventPage,
	tournamentBracketsPage,
	tournamentTeamPage,
	userPage,
} from "~/utils/urls";
import type { UserResultsLoaderData } from "../loaders/u.$identifier.results.server";
import { ParticipationPill } from "./ParticipationPill";

export type UserResultsTableProps = {
	results: UserResultsLoaderData["results"]["value"];
	id: string;
	hasHighlightCheckboxes?: boolean;
};

export const HIGHLIGHT_CHECKBOX_NAME = "highlightTeamIds";
export const HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME = "highlightTournamentTeamIds";

export function UserResultsTable({
	results,
	id,
	hasHighlightCheckboxes,
}: UserResultsTableProps) {
	const { t, i18n } = useTranslation("user");

	const placementHeaderId = `${id}-th-placement`;

	return (
		<Table>
			<thead>
				<tr>
					{hasHighlightCheckboxes && <th />}
					<th id={placementHeaderId}>{t("results.placing")}</th>
					<th>{t("results.date")}</th>
					<th>{t("results.tournament")}</th>
					<th>{t("results.participation")}</th>
					<th>{t("results.team")}</th>
				</tr>
			</thead>
			<tbody>
				{results.map((result, i) => {
					// We are trying to construct a reasonable label for the checkbox
					// which shouldn't contain the whole information of the table row as
					// that can be also accessed when needed.
					// e.g. "20xx Placing 2nd", "Big House 10 Placing 20th"
					const placementCellId = `${id}-${result.teamId}-placement`;
					const nameCellId = `${id}-${result.teamId}-name`;
					const checkboxLabelIds = `${nameCellId} ${placementHeaderId} ${placementCellId}`;

					return (
						<tr key={result.teamId}>
							{hasHighlightCheckboxes && (
								<td>
									<input
										value={result.teamId}
										aria-labelledby={checkboxLabelIds}
										name={
											result.tournamentId
												? HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME
												: HIGHLIGHT_CHECKBOX_NAME
										}
										type="checkbox"
										defaultChecked={Boolean(result.isHighlight)}
									/>
								</td>
							)}
							<td className="pl-4 whitespace-nowrap" id={placementCellId}>
								<div className="stack horizontal xs items-end">
									<Placement placement={result.placement} />{" "}
									<div className="text-lighter">
										/ {result.participantCount}
									</div>
								</div>
							</td>
							<td className="whitespace-nowrap">
								{databaseTimestampToDate(result.startTime).toLocaleDateString(
									i18n.language,
									{
										day: "numeric",
										month: "short",
										year: "numeric",
									},
								)}
							</td>
							<td id={nameCellId}>
								<div className="stack horizontal xs items-center">
									{result.eventId ? (
										<Link to={calendarEventPage(result.eventId)}>
											{result.eventName}
										</Link>
									) : null}
									{result.tournamentId ? (
										<>
											{result.logoUrl ? (
												<img
													src={result.logoUrl}
													alt=""
													width={18}
													height={18}
													className="rounded-full"
												/>
											) : null}
											<Link
												to={tournamentBracketsPage({
													tournamentId: result.tournamentId,
												})}
												data-testid="tournament-name-cell"
											>
												{result.eventName}
											</Link>
										</>
									) : null}
								</div>
							</td>
							<td>
								<ParticipationPill setResults={result.setResults} />
							</td>
							<td>
								<div className="stack horizontal md items-center">
									<SendouPopover
										trigger={
											<SendouButton
												icon={<UsersIcon />}
												size="miniscule"
												variant="minimal"
												data-testid="mates-button"
											/>
										}
									>
										<ul
											className="u__results-players"
											data-testid={`mates-cell-placement-${i}`}
										>
											{result.mates.map((player) => (
												<li
													key={player.name ? player.name : player.id}
													className="flex items-center"
												>
													{player.name ? (
														player.name
													) : (
														// as any but we know it's a user since it doesn't have name
														<Link
															to={userPage(player as any)}
															className="stack horizontal xs items-center"
														>
															<Avatar user={player as any} size="xxs" />
															{player.username}
														</Link>
													)}
												</li>
											))}
										</ul>
									</SendouPopover>
									{result.tournamentId ? (
										<Link
											to={tournamentTeamPage({
												tournamentId: result.tournamentId,
												tournamentTeamId: result.teamId,
											})}
										>
											{result.teamName}
										</Link>
									) : (
										result.teamName
									)}
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}

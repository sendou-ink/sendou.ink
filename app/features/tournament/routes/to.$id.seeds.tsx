import {
	closestCenter,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Link, useFetcher, useNavigation } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { Alert } from "~/components/Alert";
import { Catcher } from "~/components/Catcher";
import { Draggable } from "~/components/Draggable";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SubmitButton } from "~/components/SubmitButton";
import { Table } from "~/components/Table";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { useTimeoutState } from "~/hooks/useTimeoutState";
import invariant from "~/utils/invariant";
import { userResultsPage } from "~/utils/urls";
import { Avatar } from "../../../components/Avatar";
import { InfoPopover } from "../../../components/InfoPopover";
import { ordinalToRoundedSp } from "../../mmr/mmr-utils";
import { action } from "../actions/to.$id.seeds.server";
import { loader } from "../loaders/to.$id.seeds.server";
import { useTournament } from "./to.$id";
export { loader, action };

export default function TournamentSeedsPage() {
	const tournament = useTournament();
	const navigation = useNavigation();
	const [teamOrder, setTeamOrder] = React.useState(
		tournament.ctx.teams.map((t) => t.id),
	);
	const [activeTeam, setActiveTeam] = React.useState<TournamentDataTeam | null>(
		null,
	);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const teamsSorted = tournament.ctx.teams.sort(
		(a, b) => teamOrder.indexOf(a.id) - teamOrder.indexOf(b.id),
	);

	const isOutOfOrder = (
		team: TournamentDataTeam,
		previousTeam?: TournamentDataTeam,
	) => {
		if (!previousTeam) return false;

		if (
			typeof team.avgSeedingSkillOrdinal === "number" &&
			typeof previousTeam.avgSeedingSkillOrdinal === "number"
		) {
			return team.avgSeedingSkillOrdinal > previousTeam.avgSeedingSkillOrdinal;
		}

		return Boolean(previousTeam.avgSeedingSkillOrdinal);
	};

	const noOrganizerSetSeeding = tournament.ctx.teams.every(
		(team) => !team.seed,
	);

	return (
		<div className="stack lg">
			<SeedAlert teamOrder={teamOrder} />
			<div>
				{noOrganizerSetSeeding ? (
					<div className="text-lighter text-xs">
						As long as you don't manually set the seeding, the teams are
						automatically sorted by their seeding points value as participating
						players change
					</div>
				) : (
					<SendouButton
						className="tournament__seeds__order-button"
						variant="minimal"
						size="small"
						type="button"
						onPress={() => {
							setTeamOrder(
								structuredClone(tournament.ctx.teams)
									.sort(
										(a, b) =>
											(b.avgSeedingSkillOrdinal ?? Number.NEGATIVE_INFINITY) -
											(a.avgSeedingSkillOrdinal ?? Number.NEGATIVE_INFINITY),
									)
									.map((t) => t.id),
							);
						}}
					>
						Sort automatically
					</SendouButton>
				)}
			</div>
			{tournament.isMultiStartingBracket ? (
				<StartingBracketDialog
					key={tournament.ctx.teams
						.map((team) => team.startingBracketIdx ?? 0)
						.join()}
				/>
			) : null}
			<ul>
				<li className="tournament__seeds__teams-list-row">
					<div className="tournament__seeds__teams-container__header" />
					<div className="tournament__seeds__teams-container__header" />
					<div className="tournament__seeds__teams-container__header">Name</div>
					<div className="tournament__seeds__teams-container__header stack horizontal xxs">
						SP
						<InfoPopover tiny>
							Seeding point is a value that tracks players' head-to-head
							performances in tournaments. Ranked and unranked tournaments have
							different points.
						</InfoPopover>
					</div>
					<div className="tournament__seeds__teams-container__header">
						Players
					</div>
				</li>
				<DndContext
					id="team-seed-sorter"
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={(event) => {
						const newActiveTeam = teamsSorted.find(
							(t) => t.id === event.active.id,
						);
						invariant(newActiveTeam, "newActiveTeam is undefined");
						setActiveTeam(newActiveTeam);
					}}
					onDragEnd={(event) => {
						const { active, over } = event;

						if (!over) return;
						setActiveTeam(null);
						if (active.id !== over.id) {
							setTeamOrder((teamIds) => {
								const oldIndex = teamIds.indexOf(active.id as number);
								const newIndex = teamIds.indexOf(over.id as number);

								return arrayMove(teamIds, oldIndex, newIndex);
							});
						}
					}}
				>
					<SortableContext
						items={teamOrder}
						strategy={verticalListSortingStrategy}
					>
						{teamsSorted.map((team, i) => (
							<Draggable
								key={team.id}
								id={team.id}
								testId={`seed-team-${team.id}`}
								disabled={navigation.state !== "idle"}
								liClassName={clsx(
									"tournament__seeds__teams-list-row",
									"sortable",
									{
										disabled: navigation.state !== "idle",
										invisible: activeTeam?.id === team.id,
									},
								)}
							>
								<RowContents
									team={team}
									seed={i + 1}
									teamSeedingSkill={{
										sp: team.avgSeedingSkillOrdinal
											? ordinalToRoundedSp(team.avgSeedingSkillOrdinal)
											: null,
										outOfOrder: isOutOfOrder(team, teamsSorted[i - 1]),
									}}
								/>
							</Draggable>
						))}
					</SortableContext>

					<DragOverlay>
						{activeTeam && (
							<li className="tournament__seeds__teams-list-row active">
								<RowContents
									team={activeTeam}
									teamSeedingSkill={{
										sp: activeTeam.avgSeedingSkillOrdinal
											? ordinalToRoundedSp(activeTeam.avgSeedingSkillOrdinal)
											: null,
										outOfOrder: false,
									}}
								/>
							</li>
						)}
					</DragOverlay>
				</DndContext>
			</ul>
		</div>
	);
}

function StartingBracketDialog() {
	const fetcher = useFetcher();
	const tournament = useTournament();

	const [isOpen, setIsOpen] = React.useState(false);
	const [teamStartingBrackets, setTeamStartingBrackets] = React.useState(
		tournament.ctx.teams.map((team) => ({
			tournamentTeamId: team.id,
			startingBracketIdx: team.startingBracketIdx ?? 0,
		})),
	);

	const startingBrackets = tournament.ctx.settings.bracketProgression
		.flatMap((bracket, bracketIdx) => (!bracket.sources ? [bracketIdx] : []))
		.map((bracketIdx) => tournament.bracketByIdx(bracketIdx)!);

	return (
		<div>
			<SendouButton
				size="small"
				onPress={() => setIsOpen(true)}
				data-testid="set-starting-brackets"
			>
				Set starting brackets
			</SendouButton>
			<SendouDialog
				heading="Setting starting brackets"
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				isFullScreen
			>
				<fetcher.Form className="stack lg items-center" method="post">
					<div>
						{startingBrackets.map((bracket) => {
							const teamCount = teamStartingBrackets.filter(
								(t) => t.startingBracketIdx === bracket.idx,
							).length;

							return (
								<div key={bracket.id} className="stack horizontal sm text-xs">
									<span>{bracket.name}</span>
									<span>({teamCount} teams)</span>
								</div>
							);
						})}
					</div>
					<input
						type="hidden"
						name="_action"
						value="UPDATE_STARTING_BRACKETS"
					/>
					<input
						type="hidden"
						name="startingBrackets"
						value={JSON.stringify(teamStartingBrackets)}
					/>

					<Table>
						<thead>
							<tr>
								<th>Team</th>
								<th>Starting bracket</th>
							</tr>
						</thead>

						<tbody>
							{tournament.ctx.teams.map((team) => {
								const { startingBracketIdx } = teamStartingBrackets.find(
									({ tournamentTeamId }) => tournamentTeamId === team.id,
								)!;

								return (
									<tr key={team.id}>
										<td>{team.name}</td>
										<td>
											<select
												className="w-max"
												data-testid="starting-bracket-select"
												value={startingBracketIdx}
												onChange={(e) => {
													const newBracketIdx = Number(e.target.value);
													setTeamStartingBrackets((teamStartingBrackets) =>
														teamStartingBrackets.map((t) =>
															t.tournamentTeamId === team.id
																? { ...t, startingBracketIdx: newBracketIdx }
																: t,
														),
													);
												}}
											>
												{startingBrackets.map((bracket) => (
													<option key={bracket.id} value={bracket.idx}>
														{bracket.name}
													</option>
												))}
											</select>
										</td>
									</tr>
								);
							})}
						</tbody>
					</Table>
					<SubmitButton
						state={fetcher.state}
						_action="UPDATE_STARTING_BRACKETS"
						size="big"
						testId="set-starting-brackets-submit-button"
					>
						Save
					</SubmitButton>
				</fetcher.Form>
			</SendouDialog>
		</div>
	);
}

function SeedAlert({ teamOrder }: { teamOrder: number[] }) {
	const tournament = useTournament();
	const [teamOrderInDb, setTeamOrderInDb] = React.useState(teamOrder);
	const [showSuccess, setShowSuccess] = useTimeoutState(false);
	const fetcher = useFetcher();

	// TODO: figure out a better way
	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	React.useEffect(() => {
		// TODO: what if error?
		if (fetcher.state !== "loading") return;

		setTeamOrderInDb(teamOrder);
		setShowSuccess(true, { timeout: 3000 });
	}, [fetcher.state]);

	const teamOrderChanged = teamOrder.some((id, i) => id !== teamOrderInDb[i]);

	return (
		<fetcher.Form method="post" className="tournament__seeds__form">
			<input type="hidden" name="tournamentId" value={tournament.ctx.id} />
			<input type="hidden" name="seeds" value={JSON.stringify(teamOrder)} />
			<input type="hidden" name="_action" value="UPDATE_SEEDS" />
			<Alert
				variation={
					teamOrderChanged ? "WARNING" : showSuccess ? "SUCCESS" : "INFO"
				}
				alertClassName="tournament-bracket__start-bracket-alert"
				textClassName="stack horizontal md items-center"
			>
				{teamOrderChanged
					? "You have unchanged changes to seeding"
					: showSuccess
						? "Seeds saved successfully!"
						: "Drag teams to adjust their seeding"}
				{(!showSuccess || teamOrderChanged) && (
					<SubmitButton
						state={fetcher.state}
						isDisabled={!teamOrderChanged}
						size="small"
					>
						Save seeds
					</SubmitButton>
				)}
			</Alert>
		</fetcher.Form>
	);
}

function RowContents({
	team,
	seed,
	teamSeedingSkill,
}: {
	team: TournamentDataTeam;
	seed?: number;
	teamSeedingSkill: {
		sp: number | null;
		outOfOrder: boolean;
	};
}) {
	const tournament = useTournament();

	return (
		<>
			<div>{seed}</div>
			<div>
				{team.team?.logoUrl ? (
					<Avatar url={tournament.tournamentTeamLogoSrc(team)} size="xxs" />
				) : null}
			</div>
			<div className="tournament__seeds__team-name">
				{team.checkIns.length > 0 ? "✅ " : "❌ "} {team.name}
			</div>
			<div className={clsx({ "text-warning": teamSeedingSkill.outOfOrder })}>
				{teamSeedingSkill.sp}
			</div>
			<div className="stack horizontal sm">
				{team.members.map((member) => {
					return (
						<div key={member.userId} className="tournament__seeds__team-member">
							<Link
								to={userResultsPage(member, true)}
								target="_blank"
								className="tournament__seeds__team-member__name"
							>
								{member.username}
							</Link>
						</div>
					);
				})}
			</div>
		</>
	);
}

export const ErrorBoundary = Catcher;

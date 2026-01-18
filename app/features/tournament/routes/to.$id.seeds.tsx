import {
	closestCenter,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import * as React from "react";
import { Link, useFetcher, useNavigation } from "react-router";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { Catcher } from "~/components/Catcher";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { Image } from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { SubmitButton } from "~/components/SubmitButton";
import { Table } from "~/components/Table";
import type { SeedingSnapshot } from "~/db/tables";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import invariant from "~/utils/invariant";
import { navIconUrl, userResultsPage } from "~/utils/urls";
import { ordinalToRoundedSp } from "../../mmr/mmr-utils";
import { action } from "../actions/to.$id.seeds.server";
import { loader } from "../loaders/to.$id.seeds.server";
import { useTournament } from "./to.$id";
import styles from "./to.$id.seeds.module.css";
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
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 200,
				tolerance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const seedingSnapshot = tournament.ctx.seedingSnapshot;
	const newTeamIds = computeNewTeamIds(tournament.ctx.teams, seedingSnapshot);
	const newPlayersByTeam = computeNewPlayers(
		tournament.ctx.teams,
		seedingSnapshot,
	);
	const removedPlayersByTeam = computeRemovedPlayers(
		tournament.ctx.teams,
		seedingSnapshot,
	);

	const teamsSorted = [...tournament.ctx.teams].sort(
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

	const handleSeedChange = (teamId: number, newSeed: number) => {
		if (newSeed < 1) return;

		const clampedSeed = Math.min(newSeed, teamOrder.length);
		const currentIndex = teamOrder.indexOf(teamId);
		const targetIndex = clampedSeed - 1;

		if (currentIndex === targetIndex) return;

		const newOrder = [...teamOrder];
		newOrder.splice(currentIndex, 1);
		newOrder.splice(targetIndex, 0, teamId);
		setTeamOrder(newOrder);
	};

	const sortAllBySp = () => {
		const sortedTeams = [...tournament.ctx.teams].sort((a, b) => {
			if (
				a.avgSeedingSkillOrdinal !== null &&
				b.avgSeedingSkillOrdinal !== null
			) {
				return b.avgSeedingSkillOrdinal - a.avgSeedingSkillOrdinal;
			}
			if (a.avgSeedingSkillOrdinal !== null) return -1;
			if (b.avgSeedingSkillOrdinal !== null) return 1;
			return 0;
		});

		setTeamOrder(sortedTeams.map((t) => t.id));
	};

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
						className={styles.orderButton}
						variant="minimal"
						size="small"
						type="button"
						onPress={sortAllBySp}
					>
						Sort all by SP
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
			<ul className={styles.teamsList}>
				<li className={styles.headerRow}>
					<div />
					<div>Seed</div>
					<div />
					<div>Name</div>
					<div className="stack horizontal xxs">
						SP
						<InfoPopover tiny>
							Seeding point is a value that tracks players' head-to-head
							performances in tournaments. Ranked and unranked tournaments have
							different points.
						</InfoPopover>
					</div>
					<div>Players</div>
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
							<SeedingDraggable
								key={team.id}
								id={team.id}
								testId={`seed-team-${team.id}`}
								disabled={navigation.state !== "idle"}
								isActive={activeTeam?.id === team.id}
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
									isNewTeam={newTeamIds.has(team.id)}
									newPlayerIds={newPlayersByTeam.get(team.id)}
									removedPlayers={removedPlayersByTeam.get(team.id)}
									onSeedChange={(newSeed) => handleSeedChange(team.id, newSeed)}
								/>
							</SeedingDraggable>
						))}
					</SortableContext>

					<DragOverlay>
						{activeTeam ? (
							<li className={clsx(styles.teamCard, styles.overlay)}>
								<div className={styles.handleArea}>
									<button className={styles.dragHandle} type="button">
										☰
									</button>
								</div>
								<RowContents
									team={activeTeam}
									seed={teamOrder.indexOf(activeTeam.id) + 1}
									teamSeedingSkill={{
										sp: activeTeam.avgSeedingSkillOrdinal
											? ordinalToRoundedSp(activeTeam.avgSeedingSkillOrdinal)
											: null,
										outOfOrder: false,
									}}
									onSeedChange={() => {}}
								/>
							</li>
						) : null}
					</DragOverlay>
				</DndContext>
			</ul>
		</div>
	);
}

function SeedingDraggable({
	id,
	disabled,
	children,
	testId,
	isActive,
}: {
	id: number;
	disabled: boolean;
	children: React.ReactNode;
	testId?: string;
	isActive: boolean;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id, disabled });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<li
			className={clsx(styles.teamCard, {
				[styles.teamCardDragging]: isDragging,
				invisible: isActive,
			})}
			style={style}
			ref={setNodeRef}
			data-testid={testId}
			{...attributes}
		>
			<div className={styles.handleArea}>
				<button
					className={styles.dragHandle}
					{...listeners}
					disabled={disabled}
					type="button"
					data-testid={`${testId}-handle`}
				>
					☰
				</button>
			</div>
			{children}
		</li>
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
	const fetcher = useFetcher();

	const teamOrderInDb = tournament.ctx.teams.map((t) => t.id);
	const teamOrderChanged = teamOrder.some((id, i) => id !== teamOrderInDb[i]);

	return (
		<fetcher.Form method="post" className={styles.form}>
			<input type="hidden" name="tournamentId" value={tournament.ctx.id} />
			<input type="hidden" name="seeds" value={JSON.stringify(teamOrder)} />
			<input type="hidden" name="_action" value="UPDATE_SEEDS" />
			<Alert
				variation={teamOrderChanged ? "WARNING" : "INFO"}
				alertClassName="tournament-bracket__start-bracket-alert"
				textClassName="stack horizontal md items-center"
			>
				{teamOrderChanged
					? "You have unsaved changes to seeding"
					: "Drag teams to adjust their seeding"}
				<SubmitButton
					state={fetcher.state}
					isDisabled={!teamOrderChanged}
					size="small"
				>
					Save seeds
				</SubmitButton>
			</Alert>
		</fetcher.Form>
	);
}

function RowContents({
	team,
	seed,
	teamSeedingSkill,
	isNewTeam,
	newPlayerIds,
	removedPlayers,
	onSeedChange,
}: {
	team: TournamentDataTeam;
	seed?: number;
	teamSeedingSkill: {
		sp: number | null;
		outOfOrder: boolean;
	};
	isNewTeam?: boolean;
	newPlayerIds?: Set<number>;
	removedPlayers?: Array<{ userId: number; username: string }>;
	onSeedChange?: (newSeed: number) => void;
}) {
	const tournament = useTournament();
	const [inputValue, setInputValue] = React.useState(String(seed ?? ""));

	React.useEffect(() => {
		setInputValue(String(seed ?? ""));
	}, [seed]);

	const handleInputBlur = () => {
		const newSeed = Number.parseInt(inputValue, 10);
		if (!Number.isNaN(newSeed) && onSeedChange) {
			onSeedChange(newSeed);
		} else {
			setInputValue(String(seed ?? ""));
		}
	};

	const logoUrl = tournament.tournamentTeamLogoSrc(team);

	return (
		<>
			<div className={styles.seedArea}>
				{seed !== undefined && onSeedChange ? (
					<input
						type="text"
						className={styles.seedInput}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onBlur={handleInputBlur}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.currentTarget.blur();
							}
						}}
					/>
				) : (
					<div>{seed}</div>
				)}
			</div>
			<div className={styles.logoArea}>
				{logoUrl ? <Avatar url={logoUrl} size="xxs" /> : null}
			</div>
			<div className={styles.nameArea}>
				<div className={styles.teamNameContainer}>
					<span className={styles.teamName}>
						{team.checkIns.length > 0 ? "✅ " : "❌ "} {team.name}
					</span>
					{isNewTeam ? <span className={styles.newBadge}>NEW</span> : null}
				</div>
			</div>
			<div className={styles.spArea}>
				<div
					className={clsx(styles.spValue, {
						[styles.outOfOrder]: teamSeedingSkill.outOfOrder,
					})}
				>
					{teamSeedingSkill.sp}
				</div>
			</div>
			<div className={styles.playersArea}>
				<div className={styles.playersList}>
					{removedPlayers?.map((player) => (
						<div
							key={`removed-${player.userId}`}
							className={clsx(styles.playerBadge, styles.playerRemoved)}
						>
							{player.username}
						</div>
					))}
					{team.members.map((member) => {
						const isNew = newPlayerIds?.has(member.userId);
						return (
							<div
								key={member.userId}
								className={clsx(styles.playerBadge, {
									[styles.playerNew]: isNew,
								})}
							>
								<Link to={userResultsPage(member, true)}>
									{member.username}
								</Link>
								{member.plusTier ? (
									<span className={styles.plusTier}>
										<Image
											path={navIconUrl("plus")}
											width={14}
											height={14}
											alt=""
										/>
										{member.plusTier}
									</span>
								) : null}
								{isNew ? (
									<span className={styles.playerNewBadge}>NEW</span>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}

function computeNewTeamIds(
	teams: TournamentDataTeam[],
	snapshot: SeedingSnapshot | null,
): Set<number> {
	if (!snapshot) return new Set();
	const savedTeamIds = new Set(snapshot.teams.map((t) => t.teamId));
	return new Set(teams.filter((t) => !savedTeamIds.has(t.id)).map((t) => t.id));
}

function computeNewPlayers(
	teams: TournamentDataTeam[],
	snapshot: SeedingSnapshot | null,
): Map<number, Set<number>> {
	const result = new Map<number, Set<number>>();
	if (!snapshot) return result;

	const savedTeamMap = new Map(
		snapshot.teams.map((t) => [
			t.teamId,
			new Set(t.members.map((m) => m.userId)),
		]),
	);

	for (const team of teams) {
		const savedMembers = savedTeamMap.get(team.id);
		if (!savedMembers) continue;

		const newPlayerIds = new Set(
			team.members
				.filter((m) => !savedMembers.has(m.userId))
				.map((m) => m.userId),
		);
		if (newPlayerIds.size > 0) {
			result.set(team.id, newPlayerIds);
		}
	}
	return result;
}

function computeRemovedPlayers(
	teams: TournamentDataTeam[],
	snapshot: SeedingSnapshot | null,
): Map<number, Array<{ userId: number; username: string }>> {
	const result = new Map<number, Array<{ userId: number; username: string }>>();
	if (!snapshot) return result;

	const currentTeamMap = new Map(
		teams.map((t) => [t.id, new Set(t.members.map((m) => m.userId))]),
	);

	for (const savedTeam of snapshot.teams) {
		const currentMembers = currentTeamMap.get(savedTeam.teamId);
		if (!currentMembers) continue;

		const removedMembers = savedTeam.members.filter(
			(member) => !currentMembers.has(member.userId),
		);
		if (removedMembers.length > 0) {
			result.set(savedTeam.teamId, removedMembers);
		}
	}
	return result;
}

export const ErrorBoundary = Catcher;

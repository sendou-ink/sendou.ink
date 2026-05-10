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
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouDialog } from "~/components/elements/Dialog";
import { Image } from "~/components/Image";
import { InfoPopover } from "~/components/InfoPopover";
import { SubmitButton } from "~/components/SubmitButton";
import { Table } from "~/components/Table";
import type { SeedingSnapshot } from "~/db/tables";
import * as AbDivisions from "~/features/tournament-bracket/core/AbDivisions";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import invariant from "~/utils/invariant";
import { navIconUrl, userResultsPage } from "~/utils/urls";
import { ordinalToRoundedSp } from "../../mmr/mmr-utils";
import { action } from "../actions/to.$id.seeds.server";
import { loader } from "../loaders/to.$id.seeds.server";
import { TOURNAMENT } from "../tournament-constants";
import { useTournament } from "./to.$id";
import styles from "./to.$id.seeds.module.css";

export { action, loader };

const AB_DIVISION_RADIO_OPTIONS = [
	{ value: "unassigned", label: "Unassigned" },
	{ value: "0", label: "A" },
	{ value: "1", label: "B" },
] as const;

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
			{hasAbDivisionsStartingBracket(tournament) ? (
				<>
					<AbDivisionsDialog
						key={tournament.ctx.teams
							.map((team) => team.abDivision ?? -1)
							.join()}
					/>
					<AbDivisionImbalanceWarning />
				</>
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

function hasAbDivisionsStartingBracket(tournament: Tournament) {
	return tournament.ctx.settings.bracketProgression.some(
		(bracket) => !bracket.sources && bracket.settings?.hasAbDivisions,
	);
}

function AbDivisionImbalanceWarning() {
	const tournament = useTournament();

	const warnings = tournament.ctx.settings.bracketProgression
		.map((bracket, bracketIdx) => {
			if (bracket.sources || !bracket.settings?.hasAbDivisions) return null;

			const bracketTeams = tournament.isMultiStartingBracket
				? tournament.ctx.teams.filter(
						(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
					)
				: tournament.ctx.teams;
			const checkedInTeams = bracketTeams.filter(
				(team) => team.checkIns.length > 0,
			);

			const { a, b } = AbDivisions.countByDivision(checkedInTeams);
			const diff = Math.abs(a - b);

			const teamsPerGroup =
				bracket.settings.teamsPerGroup ??
				TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;
			const groupCount = Math.max(
				1,
				Math.ceil(checkedInTeams.length / teamsPerGroup),
			);

			const tooImbalanced = diff > 1;
			const unevenWithMultipleGroups = diff === 1 && groupCount > 1;
			if (!tooImbalanced && !unevenWithMultipleGroups) return null;

			const prefix = tournament.isMultiStartingBracket
				? `${bracket.name}: `
				: "";
			const reason = tooImbalanced
				? "counts can differ by at most 1 to start bracket"
				: "uneven A/B is only allowed with a single group";

			return `${prefix}${a} checked-in A teams, ${b} checked-in B teams — ${reason}.`;
		})
		.filter((warning): warning is string => warning !== null);

	if (warnings.length === 0) return null;

	return (
		<Alert variation="WARNING">
			<div
				data-testid="ab-divisions-imbalance-warning"
				className="stack xs text-xs"
			>
				{warnings.map((warning) => (
					<div key={warning}>{warning}</div>
				))}
			</div>
		</Alert>
	);
}

type AbDivisionValue = 0 | 1 | null;

function AbDivisionsDialog() {
	const fetcher = useFetcher();
	const tournament = useTournament();

	const [isOpen, setIsOpen] = React.useState(false);
	const [teamAbDivisions, setTeamAbDivisions] = React.useState<
		{ tournamentTeamId: number; abDivision: AbDivisionValue }[]
	>(
		tournament.ctx.teams.map((team) => ({
			tournamentTeamId: team.id,
			abDivision:
				team.abDivision === 0 || team.abDivision === 1 ? team.abDivision : null,
		})),
	);

	const counts = AbDivisions.countByDivision(teamAbDivisions);

	return (
		<div>
			<SendouButton
				size="small"
				onPress={() => setIsOpen(true)}
				data-testid="set-ab-divisions"
			>
				Set A/B divisions
			</SendouButton>
			<SendouDialog
				heading="Setting A/B divisions"
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				isFullScreen
			>
				<fetcher.Form className="stack lg items-center" method="post">
					<div className="stack horizontal sm text-xs">
						<span>A: {counts.a}</span>
						<span>B: {counts.b}</span>
						<span>Unassigned: {counts.unassigned}</span>
					</div>
					<input type="hidden" name="_action" value="UPDATE_AB_DIVISIONS" />
					<input
						type="hidden"
						name="abDivisions"
						value={JSON.stringify(teamAbDivisions)}
					/>

					<Table>
						<thead>
							<tr>
								<th>Team</th>
								<th>Division</th>
							</tr>
						</thead>
						<tbody>
							{tournament.ctx.teams.map((team) => {
								const { abDivision } = teamAbDivisions.find(
									({ tournamentTeamId }) => tournamentTeamId === team.id,
								)!;

								return (
									<tr key={team.id}>
										<td>{team.name}</td>
										<td data-testid="ab-division-radio-group">
											<SendouChipRadioGroup>
												{AB_DIVISION_RADIO_OPTIONS.map(({ value, label }) => (
													<SendouChipRadio
														key={value}
														name={`ab-division-${team.id}`}
														value={value}
														checked={
															(abDivision === null
																? "unassigned"
																: String(abDivision)) === value
														}
														onChange={(rawValue) => {
															const newDivision: AbDivisionValue =
																rawValue === "unassigned"
																	? null
																	: (Number(rawValue) as 0 | 1);
															setTeamAbDivisions((teamAbDivisions) =>
																teamAbDivisions.map((t) =>
																	t.tournamentTeamId === team.id
																		? { ...t, abDivision: newDivision }
																		: t,
																),
															);
														}}
													>
														{label}
													</SendouChipRadio>
												))}
											</SendouChipRadioGroup>
										</td>
									</tr>
								);
							})}
						</tbody>
					</Table>
					<SubmitButton
						state={fetcher.state}
						_action="UPDATE_AB_DIVISIONS"
						size="big"
						testId="set-ab-divisions-submit-button"
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

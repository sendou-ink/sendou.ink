import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	TouchSensor,
	type UniqueIdentifier,
	useDroppable,
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
import { ArrowRightLeft, GripVertical, Tv } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { useUser } from "~/features/auth/core/user";
import { useLiveRevalidation } from "~/features/chat/chat-hooks";
import { useEventsTopic } from "~/features/events/events-hooks";
import { useTournament } from "~/features/tournament/tournament-context";
import type {
	StationsBoardMatch,
	StationsBoardStation,
} from "~/features/tournament-stations/core/StationsBoard";
import { stationsBoardActionSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { tournamentAdminPage, tournamentMatchPage } from "~/utils/urls";
import type { TournamentAdminBoardLoaderData } from "../loaders/to.$id.admin.board.server";
import styles from "./to.$id.admin.board.module.css";

export { action } from "../actions/to.$id.admin.board.server";
export { loader } from "../loaders/to.$id.admin.board.server";

const WAITING_LANE = "waiting";

type LaneId = typeof WAITING_LANE | `station-${number}`;
type Lanes = Record<LaneId, number[]>;

export default function TournamentAdminBoardPage() {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<TournamentAdminBoardLoaderData>();
	const tournament = useTournament();
	const user = useUser();

	useLiveRevalidation();

	return (
		<div className="stack md">
			{data.topics.map((topic) => (
				<TopicSubscription key={topic} topic={topic} />
			))}
			{data.stations.length === 0 ? (
				<Alert>
					<div className="stack sm items-start">
						<span>{t("tournament:stations.board.noStations")}</span>
						{tournament.isOrganizer(user) ? (
							<LinkButton
								size="small"
								to={`${tournamentAdminPage(tournament.ctx.id)}/stations`}
							>
								{t("tournament:stations.board.addStations")}
							</LinkButton>
						) : null}
					</div>
				</Alert>
			) : (
				<>
					{!tournament.hasStarted ? (
						<Alert>{t("tournament:stations.board.notStarted")}</Alert>
					) : null}
					{!data.canEdit ? (
						<Alert tiny>{t("tournament:stations.board.readOnly")}</Alert>
					) : null}
					<Board data={data} />
				</>
			)}
		</div>
	);
}

function TopicSubscription({ topic }: { topic: string }) {
	useEventsTopic(topic);

	return null;
}

function Board({ data }: { data: TournamentAdminBoardLoaderData }) {
	const { submit } = useActionSubmit(stationsBoardActionSchema);
	const [lanes, setLanes] = React.useState(() => lanesOf(data));
	const [lanesOfData, setLanesOfData] = React.useState(data);
	const [activeMatchId, setActiveMatchId] = React.useState<number | null>(null);
	const [dragOrigin, setDragOrigin] = React.useState<{
		lane: LaneId;
		index: number;
	} | null>(null);

	// a revalidation brings the server's board, replacing the optimistic one (but not under a drag)
	if (lanesOfData !== data && activeMatchId === null) {
		setLanesOfData(data);
		setLanes(lanesOf(data));
	}

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const matchesById = new Map(
		[
			...data.stations.flatMap((station) => station.matches),
			...data.waiting,
		].map((match) => [match.id, match]),
	);

	const findLane = (id: UniqueIdentifier, from: Lanes = lanes) => {
		if (typeof id === "string") return id in from ? (id as LaneId) : null;

		return (
			(Object.keys(from) as LaneId[]).find((lane) => from[lane].includes(id)) ??
			null
		);
	};

	const moveMatch = (matchId: number, lane: LaneId, index: number) => {
		submit("MOVE_MATCH", {
			matchId,
			stationId: stationIdOfLane(lane),
			index,
		});
	};

	const handleMoveFromMenu = (matchId: number, lane: LaneId) => {
		const fromLane = findLane(matchId);
		if (!fromLane || fromLane === lane) return;

		const index = lanes[lane].length;
		setLanes({
			...lanes,
			[fromLane]: lanes[fromLane].filter((id) => id !== matchId),
			[lane]: [...lanes[lane], matchId],
		});
		moveMatch(matchId, lane, index);
	};

	const handleDragStart = ({ active }: DragStartEvent) => {
		const lane = findLane(active.id);
		if (!lane || typeof active.id !== "number") return;

		setActiveMatchId(active.id);
		setDragOrigin({ lane, index: lanes[lane].indexOf(active.id) });
	};

	const handleDragOver = ({ active, over }: DragOverEvent) => {
		if (!over || typeof active.id !== "number") return;

		const activeLane = findLane(active.id);
		const overLane = findLane(over.id);
		// reordering within a lane happens on drop, here it would loop render → drag over
		if (!activeLane || !overLane || activeLane === overLane) return;

		const overItems = lanes[overLane];
		const overIndex =
			typeof over.id === "number" ? overItems.indexOf(over.id) : -1;
		const matchId = active.id;

		setLanes({
			...lanes,
			[activeLane]: lanes[activeLane].filter((id) => id !== matchId),
			[overLane]: overItems.toSpliced(
				overIndex === -1 ? overItems.length : overIndex,
				0,
				matchId,
			),
		});
	};

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		setActiveMatchId(null);
		setDragOrigin(null);

		const lane = findLane(active.id);
		if (!lane || !dragOrigin || typeof active.id !== "number") return;

		let finalLanes = lanes;
		if (over && typeof over.id === "number" && findLane(over.id) === lane) {
			const from = lanes[lane].indexOf(active.id);
			const to = lanes[lane].indexOf(over.id);
			if (from !== to) {
				finalLanes = { ...lanes, [lane]: arrayMove(lanes[lane], from, to) };
				setLanes(finalLanes);
			}
		}

		const index = finalLanes[lane].indexOf(active.id);
		const isUnchanged =
			lane === dragOrigin.lane &&
			(lane === WAITING_LANE || index === dragOrigin.index);
		if (isUnchanged) return;

		moveMatch(active.id, lane, index);
	};

	const handleDragCancel = () => {
		setActiveMatchId(null);
		setDragOrigin(null);
		setLanes(lanesOf(data));
	};

	const laneOptions: Array<{ id: LaneId; name: string }> = [
		...data.stations.map((station) => ({
			id: stationLaneId(station.id),
			name: station.name,
		})),
	];

	const renderLane = (laneId: LaneId, station: StationsBoardStation | null) => (
		<Lane
			key={laneId}
			laneId={laneId}
			station={station}
			matches={lanes[laneId].flatMap((matchId) => {
				const match = matchesById.get(matchId);
				return match ? [match] : [];
			})}
			canEdit={data.canEdit}
			moveOptions={laneOptions.filter((option) => option.id !== laneId)}
			onMove={handleMoveFromMenu}
		/>
	);

	const activeMatch =
		activeMatchId !== null ? matchesById.get(activeMatchId) : undefined;

	return (
		<DndContext
			id="stations-board"
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div className={styles.board}>
				{renderLane(WAITING_LANE, null)}
				{data.stations.map((station) =>
					renderLane(stationLaneId(station.id), station),
				)}
			</div>
			<DragOverlay>
				{activeMatch ? (
					<MatchCardContent
						match={activeMatch}
						showSlot={dragOrigin?.lane !== WAITING_LANE}
						dragHandle={
							<span
								className={clsx(styles.dragHandle, styles.dragHandleGrabbed)}
								aria-hidden
							>
								<GripVertical />
							</span>
						}
						menu={
							<SendouButton
								size="miniscule"
								variant="minimal"
								icon={<ArrowRightLeft />}
								aria-hidden
								tabIndex={-1}
							/>
						}
					/>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

function Lane({
	laneId,
	station,
	matches,
	canEdit,
	moveOptions,
	onMove,
}: {
	laneId: LaneId;
	/** `null` for the Waiting lane. */
	station: StationsBoardStation | null;
	matches: StationsBoardMatch[];
	canEdit: boolean;
	moveOptions: Array<{ id: LaneId; name: string }>;
	onMove: (matchId: number, lane: LaneId) => void;
}) {
	const { t } = useTranslation(["tournament"]);
	const { setNodeRef } = useDroppable({ id: laneId, disabled: !canEdit });

	const options = station
		? [
				{
					id: WAITING_LANE as LaneId,
					name: t("tournament:stations.board.waiting"),
				},
				...moveOptions,
			]
		: moveOptions;

	return (
		<section
			className={clsx(styles.lane, { [styles.waitingLane]: !station })}
			data-testid={`board-lane-${laneId}`}
		>
			<header className={styles.laneHeader}>
				<h2 className={styles.laneName}>
					{station?.isStream ? (
						<Tv
							className={styles.streamIcon}
							aria-label={t("tournament:stations.board.stream")}
						/>
					) : null}
					{station ? station.name : t("tournament:stations.board.waiting")}
				</h2>
				{station?.locationNote ? (
					<div className={styles.laneNote}>{station.locationNote}</div>
				) : null}
				{!station ? (
					<div className={styles.laneNote}>
						{t("tournament:stations.board.waiting.explanation")}
					</div>
				) : null}
			</header>
			<SortableContext
				id={laneId}
				items={matches.map((match) => match.id)}
				strategy={verticalListSortingStrategy}
			>
				<ol ref={setNodeRef} className={styles.matches}>
					{matches.map((match) => (
						<SortableMatchCard
							key={match.id}
							match={match}
							showSlot={station !== null}
							canEdit={canEdit}
							moveOptions={options}
							onMove={onMove}
						/>
					))}
					{matches.length === 0 ? (
						<li className={styles.emptyLane}>
							{t("tournament:stations.board.empty")}
						</li>
					) : null}
				</ol>
			</SortableContext>
		</section>
	);
}

function SortableMatchCard({
	match,
	showSlot,
	canEdit,
	moveOptions,
	onMove,
}: {
	match: StationsBoardMatch;
	showSlot: boolean;
	canEdit: boolean;
	moveOptions: Array<{ id: LaneId; name: string }>;
	onMove: (matchId: number, lane: LaneId) => void;
}) {
	const { t } = useTranslation(["tournament"]);
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: match.id, disabled: !canEdit });

	return (
		<li
			ref={setNodeRef}
			className={clsx({ [styles.dragging]: isDragging })}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			data-testid={`board-match-${match.id}`}
			{...attributes}
		>
			<MatchCardContent
				match={match}
				showSlot={showSlot}
				dragHandle={
					canEdit ? (
						<button
							ref={setActivatorNodeRef}
							type="button"
							className={styles.dragHandle}
							aria-label={t("tournament:stations.board.drag")}
							data-testid={`board-match-${match.id}-handle`}
							{...listeners}
						>
							<GripVertical />
						</button>
					) : null
				}
				menu={
					canEdit && moveOptions.length > 0 ? (
						<SendouMenu
							opensLeft
							trigger={
								<SendouButton
									size="miniscule"
									variant="minimal"
									icon={<ArrowRightLeft />}
									aria-label={t("tournament:stations.board.moveTo")}
									testId={`board-match-${match.id}-move`}
								/>
							}
						>
							{moveOptions.map((option) => (
								<SendouMenuItem
									key={option.id}
									onAction={() => onMove(match.id, option.id)}
									data-testid={`board-move-to-${option.id}`}
								>
									{option.name}
								</SendouMenuItem>
							))}
						</SendouMenu>
					) : null
				}
			/>
		</li>
	);
}

function MatchCardContent({
	match,
	showSlot,
	dragHandle,
	menu,
}: {
	match: StationsBoardMatch;
	showSlot: boolean;
	dragHandle?: React.ReactNode;
	menu?: React.ReactNode;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	const slot = showSlot ? match.slot : null;
	const hasScore = match.score[0] > 0 || match.score[1] > 0;

	return (
		<div
			className={clsx(styles.card, {
				[styles.cardPending]: !match.isPlayable,
			})}
		>
			{dragHandle}
			<div className={styles.cardBody}>
				<div className={styles.cardMeta}>
					{slot ? (
						<span
							className={clsx(styles.slot, {
								[styles.slotNow]: slot === "NOW",
							})}
						>
							{slot === "NOW"
								? t("tournament:stations.board.now")
								: t("tournament:stations.board.next")}
						</span>
					) : null}
					<Link
						to={tournamentMatchPage({
							tournamentId: tournament.ctx.id,
							matchId: match.id,
						})}
						className={styles.roundName}
					>
						{[match.bracketName, match.roundName].filter(Boolean).join(" · ")}
					</Link>
				</div>
				<div className={styles.teams}>
					{match.teams.map((team, idx) => (
						<div key={idx} className={styles.team}>
							<span className={styles.teamName}>
								{team?.name ?? t("tournament:match.tbd")}
							</span>
							{hasScore ? (
								<span className={styles.score}>{match.score[idx]}</span>
							) : null}
						</div>
					))}
				</div>
			</div>
			{menu}
		</div>
	);
}

function lanesOf(data: {
	stations: StationsBoardStation[];
	waiting: StationsBoardMatch[];
}): Lanes {
	const lanes: Lanes = {
		[WAITING_LANE]: data.waiting.map((match) => match.id),
	};
	for (const station of data.stations) {
		lanes[stationLaneId(station.id)] = station.matches.map((match) => match.id);
	}

	return lanes;
}

function stationLaneId(stationId: number): LaneId {
	return `station-${stationId}`;
}

function stationIdOfLane(lane: LaneId) {
	if (lane === WAITING_LANE) return undefined;

	return Number(lane.replace("station-", ""));
}

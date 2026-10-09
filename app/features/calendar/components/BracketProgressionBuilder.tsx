import {
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	pointerWithin,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import clsx from "clsx";
import { isSameDay } from "date-fns";
import type { TFunction } from "i18next";
import { ArrowRight, Plus, Trash, X } from "lucide-react";
import * as React from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormMessage } from "~/components/FormMessage";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	useFieldRevealer,
	useFormFieldContext,
	useOptionalFormFieldContext,
} from "~/form/SendouForm";
import type { ArrayItemRenderContext } from "~/form/types";
import { errorMessageId, setNestedValue } from "~/form/utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import {
	type BracketFormValue,
	type ProgressionFormValue,
	sourceBracketHasEarlyAdvance,
} from "../calendar-progression-form";
import * as BracketBuilder from "../core/BracketBuilder";
import styles from "./BracketProgressionBuilder.module.css";
import { BracketFields } from "./BracketProgressionFormFields";

// keep in sync with the card and column sizes in the CSS module
const CARD_WIDTH = 224;
const CARD_MIN_HEIGHT = 104;
const COLUMN_GAP = 128;
const ROW_GAP = 16;
const COLUMN_HEADER_HEIGHT = 64;
const BOARD_PADDING = 12;
const LANE_HEIGHT = 36;
const BOARD_DIMENSIONS: BracketBuilder.BoardDimensions = {
	cardWidth: CARD_WIDTH,
	minCardHeight: CARD_MIN_HEIGHT,
	columnGap: COLUMN_GAP,
	rowGap: ROW_GAP,
	headerHeight: COLUMN_HEADER_HEIGHT,
	padding: BOARD_PADDING,
	laneHeight: LANE_HEIGHT,
};
const MOUSE_DRAG_DISTANCE = 4;
const TOUCH_DRAG_DELAY_MS = 200;
const TOUCH_DRAG_TOLERANCE = 5;

const BRACKET_TYPE_SHORT: Record<BracketFormValue["type"], string> = {
	single_elimination: "SE",
	double_elimination: "DE",
	round_robin: "RR",
	swiss: "SW",
};

type Selection =
	| { kind: "bracket"; bracketIdx: number }
	| { kind: "connection"; toIdx: number; sourceIdx: number };

type DragData =
	| { kind: "move"; bracketIdx: number }
	| { kind: "connect"; fromIdx: number };

type DropData =
	| { kind: "column"; column: number }
	| { kind: "card"; bracketIdx: number };

type ActiveDrag =
	| { kind: "move"; bracketIdx: number; hoveredColumn: number | null }
	| {
			kind: "connect";
			fromIdx: number;
			/** Where in the port the pointer grabbed it, from its center */
			grabOffset: { x: number; y: number };
			delta: { x: number; y: number };
			hoveredIdx: number | null;
	  };

/**
 * Bracket progression as columns of bracket cards joined by lines: starting brackets first, each follow-up
 * right of the brackets it takes teams from. One bracket or line at a time is edited in the side panel.
 */
export function BracketProgressionBuilder({
	isInvitational,
}: {
	isInvitational: boolean;
}) {
	const { t } = useTranslation(["calendar", "common", "forms"]);
	const { formatter: startTimeFormatter } = useDateTimeFormat({
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});
	const { formatter: startDateTimeFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "2-digit",
	});
	const {
		values: formValues,
		setValue,
		clientErrors,
		serverErrors,
		hasSubmitted,
		revalidateAll,
		clearServerError,
	} = useFormFieldContext();
	const formContext = useOptionalFormFieldContext();
	const values: BracketBuilder.BuilderValues = {
		brackets: (formValues.brackets ?? []) as BracketFormValue[],
		progression: (formValues.progression ?? []) as ProgressionFormValue[],
	};

	const [selection, setSelection] = React.useState<Selection | null>(null);
	const [minColumns, setMinColumns] = React.useState<Array<number | undefined>>(
		[],
	);
	const [linkFromIdx, setLinkFromIdx] = React.useState<number | null>(null);
	const [notice, setNotice] = React.useState<string | null>(null);
	const [activeDrag, setActiveDrag] = React.useState<ActiveDrag | null>(null);
	const [hoveredLineKey, setHoveredLineKey] = React.useState<string | null>(
		null,
	);
	const [cardHeights, setCardHeights] = React.useState<
		Array<number | undefined>
	>([]);
	const builderRef = React.useRef<HTMLElement>(null);
	const scrollerRef = React.useRef<HTMLDivElement>(null);
	const panelRef = React.useRef<HTMLElement>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { distance: MOUSE_DRAG_DISTANCE },
		}),
		// a delay so that swiping the board still scrolls it
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: TOUCH_DRAG_DELAY_MS,
				tolerance: TOUCH_DRAG_TOLERANCE,
			},
		}),
	);

	useFieldRevealer((fieldName) => {
		const match = fieldName.match(
			/^(brackets|progression)\[(\d+)\](?:\.sources\[(\d+)\])?/,
		);
		if (!match) return;

		const bracketIdx = Number(match[2]);
		const firstIncoming = BracketBuilder.connections(values).find(
			(line) => line.toIdx === bracketIdx,
		);
		if (match[1] === "progression" && match[3] !== undefined) {
			setSelection({
				kind: "connection",
				toIdx: bracketIdx,
				sourceIdx: Number(match[3]),
			});
		} else if (match[1] === "progression" && firstIncoming) {
			// errors of the sources as a whole are shown with the bracket's lines
			setSelection({
				kind: "connection",
				toIdx: bracketIdx,
				sourceIdx: firstIncoming.sourceIdx,
			});
		} else {
			setSelection({ kind: "bracket", bracketIdx });
		}
	});

	const errors = { ...clientErrors, ...serverErrors } as Record<
		string,
		string | undefined
	>;
	const errorKeys = Object.keys(errors).filter((key) => errors[key]);

	const setPlacements = (
		line: BracketBuilder.Connection,
		placements: string,
	) => {
		const name = `progression[${line.toIdx}].sources[${line.sourceIdx}].placements`;
		const updatedFormValues = setNestedValue(formValues, name, placements);
		// fewer teams moving on can leave the brackets after with fewer placements
		const fitted = BracketBuilder.fitPlacementsToSources({
			brackets: values.brackets,
			progression: updatedFormValues.progression as ProgressionFormValue[],
		});
		setValue("progression", fitted.progression);
		clearServerError(name);
		if (hasSubmitted) {
			revalidateAll({ ...updatedFormValues, progression: fitted.progression });
		}
	};

	const commit = (newValues: BracketBuilder.BuilderValues) => {
		const fitted = BracketBuilder.fitPlacementsToSources(newValues);
		setValue("brackets", fitted.brackets);
		setValue("progression", fitted.progression);
		clearServerError("brackets");
		clearServerError("progression");
		if (hasSubmitted) revalidateAll({ ...formValues, ...fitted });
	};

	// format and settings fields write the form values themselves, so the latest values are read from the store
	const fitPlacementsToBracketSettings = () => {
		if (!formContext) return;

		const latestValues = formContext.store.values;
		const latest: BracketBuilder.BuilderValues = {
			brackets: latestValues.brackets as BracketFormValue[],
			progression: latestValues.progression as ProgressionFormValue[],
		};
		const fitted = BracketBuilder.fitPlacementsToSources(latest);
		if (fitted === latest) return;

		setValue("progression", fitted.progression);
		clearServerError("progression");
		if (hasSubmitted) {
			revalidateAll({ ...latestValues, progression: fitted.progression });
		}
	};

	const tournamentStartTime =
		formValues.startTime instanceof Date ? formValues.startTime : null;
	const isOnTournamentStartDay = (date: Date) =>
		tournamentStartTime ? isSameDay(date, tournamentStartTime) : false;

	const bracketColumns = BracketBuilder.columns(values, minColumns);
	const lines = BracketBuilder.connections(values);
	const maxTeamCounts = BracketBuilder.maxTeamCounts(values);
	const canAddBracket =
		values.brackets.length < TOURNAMENT.MAX_BRACKETS_PER_TOURNAMENT;
	const usedColumnCount = Math.max(1, ...bracketColumns.map((c) => c + 1));
	const columnCount = usedColumnCount + 1;

	const layout = BracketBuilder.boardLayout(
		values,
		bracketColumns,
		BOARD_DIMENSIONS,
		cardHeights,
	);
	const positions = layout.cards;
	const boardWidth =
		BOARD_PADDING * 2 +
		columnCount * CARD_WIDTH +
		(columnCount - 1) * COLUMN_GAP;
	const boardHeight = Math.max(360, layout.height + 48);

	const bracketName = (bracketIdx: number) =>
		values.brackets[bracketIdx]?.name || t("calendar:builder.unnamed");

	// on narrow screens the panel is below the board, maybe out of view
	const selectAndShowPanel = (newSelection: Selection) => {
		flushSync(() => setSelection(newSelection));
		scrollToStartIfOutOfView(panelRef.current);
	};

	const closePanel = () => {
		flushSync(() => setSelection(null));
		const builder = builderRef.current;
		if (builder && builder.getBoundingClientRect().top < 0) {
			builder.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	const scrollColumnIntoBoardView = (column: number) => {
		const scroller = scrollerRef.current;
		if (!scroller) return;

		const cardLeft = BOARD_PADDING + column * (CARD_WIDTH + COLUMN_GAP);
		const isVisible =
			cardLeft >= scroller.scrollLeft &&
			cardLeft + CARD_WIDTH <= scroller.scrollLeft + scroller.clientWidth;
		if (isVisible) return;

		scroller.scrollTo({ left: cardLeft - BOARD_PADDING, behavior: "smooth" });
	};

	const addBracket = () => {
		const newBracketIdx = values.brackets.length;
		const result = BracketBuilder.addBracket(
			values,
			BracketBuilder.defaultBracketName(values, (number) =>
				t("calendar:builder.defaultBracketName", { number }),
			),
			minColumns,
		);
		commit(result.values);
		setMinColumns((prev) => {
			const next = [...prev];
			next[newBracketIdx] = result.column > 0 ? result.column : undefined;
			return next;
		});
		setNotice(null);
		selectAndShowPanel({ kind: "bracket", bracketIdx: newBracketIdx });
		scrollColumnIntoBoardView(result.column);
	};

	const moveToColumn = (bracketIdx: number, column: number) => {
		const result = BracketBuilder.moveToColumn(
			values,
			bracketIdx,
			column,
			minColumns,
		);
		commit(result.values);
		setMinColumns((prev) => {
			const next = [...prev];
			next[bracketIdx] = column > 0 ? column : undefined;
			return next;
		});
		setSelection({ kind: "bracket", bracketIdx });
		setNotice(
			bracketIdx === 0
				? t("calendar:builder.notice.FIRST_BRACKET")
				: result.removedConnectionCount > 0
					? t("calendar:builder.notice.removedConnections")
					: null,
		);
	};

	const connect = (fromIdx: number, toIdx: number) => {
		setLinkFromIdx(null);
		const result = BracketBuilder.connect(values, fromIdx, toIdx, minColumns);
		if (result.error) {
			setNotice(t(`calendar:builder.notice.${result.error}`));
			return;
		}

		commit(result.values);
		const line = BracketBuilder.connections(result.values).find(
			(candidate) => candidate.fromIdx === fromIdx && candidate.toIdx === toIdx,
		);
		setNotice(null);
		if (line) {
			selectAndShowPanel({
				kind: "connection",
				toIdx,
				sourceIdx: line.sourceIdx,
			});
		}
	};

	const removeBracket = (bracketIdx: number) => {
		commit(BracketBuilder.removeBracket(values, bracketIdx));
		setMinColumns((prev) => prev.filter((_, idx) => idx !== bracketIdx));
		setNotice(null);
		closePanel();
	};

	const canConnect = (fromIdx: number, toIdx: number) =>
		BracketBuilder.connectError(values, fromIdx, toIdx, minColumns) === null;

	const handleDragStart = (event: DragStartEvent) => {
		const data = event.active.data.current as DragData;
		setNotice(null);

		if (data.kind === "move") {
			setActiveDrag({
				kind: "move",
				bracketIdx: data.bracketIdx,
				hoveredColumn: null,
			});
			return;
		}

		setLinkFromIdx(null);
		const port = (event.activatorEvent.target as HTMLElement).closest("button");
		const portRect = port?.getBoundingClientRect();
		const grabbedAt = getEventCoordinates(event.activatorEvent);
		setActiveDrag({
			kind: "connect",
			fromIdx: data.fromIdx,
			grabOffset:
				portRect && grabbedAt
					? {
							x: grabbedAt.x - (portRect.left + portRect.width / 2),
							y: grabbedAt.y - (portRect.top + portRect.height / 2),
						}
					: { x: 0, y: 0 },
			delta: { x: 0, y: 0 },
			hoveredIdx: null,
		});
	};

	const handleDragMove = (event: DragMoveEvent) => {
		const over = event.over?.data.current as DropData | undefined;

		// functional updates, dnd-kit can report a move after the drag already ended
		setActiveDrag((current) => {
			if (current?.kind === "move") {
				const hoveredColumn = !over
					? null
					: over.kind === "column"
						? over.column
						: bracketColumns[over.bracketIdx];

				return hoveredColumn === current.hoveredColumn
					? current
					: { ...current, hoveredColumn };
			}

			if (current?.kind === "connect") {
				return {
					...current,
					delta: event.delta,
					hoveredIdx:
						over?.kind === "card" &&
						canConnect(current.fromIdx, over.bracketIdx)
							? over.bracketIdx
							: null,
				};
			}

			return current;
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const data = event.active.data.current as DragData;
		const over = event.over?.data.current as DropData | undefined;
		setActiveDrag(null);
		if (!over) return;

		if (data.kind === "connect") {
			if (over.kind === "card" && canConnect(data.fromIdx, over.bracketIdx)) {
				connect(data.fromIdx, over.bracketIdx);
			}
			return;
		}

		if (over.kind === "column") {
			moveToColumn(data.bracketIdx, over.column);
		} else if (over.bracketIdx !== data.bracketIdx) {
			moveToColumn(data.bracketIdx, bracketColumns[over.bracketIdx]);
		}
	};

	const connectDrag = activeDrag?.kind === "connect" ? activeDrag : null;
	const moveDrag = activeDrag?.kind === "move" ? activeDrag : null;
	const linkingFromIdx = connectDrag?.fromIdx ?? linkFromIdx;
	const draftLine = connectDrag ? draftLineOf(connectDrag, positions) : null;

	const selectedBracketIdx =
		selection?.kind === "bracket" ? selection.bracketIdx : null;
	const selectedLine =
		selection?.kind === "connection"
			? lines.find(
					(line) =>
						line.toIdx === selection.toIdx &&
						line.sourceIdx === selection.sourceIdx,
				)
			: undefined;

	const selectLine = (line: BracketBuilder.Connection) =>
		selectAndShowPanel({
			kind: "connection",
			toIdx: line.toIdx,
			sourceIdx: line.sourceIdx,
		});
	const highlightedLineKey = activeDrag ? null : hoveredLineKey;
	const highlightedLine = lines.find(
		(line) => lineKey(line) === highlightedLineKey,
	);

	const hasErrorWithin = (prefix: string) =>
		errorKeys.some(
			(key) =>
				key === prefix ||
				key.startsWith(`${prefix}.`) ||
				key.startsWith(`${prefix}[`),
		);

	return (
		<div className={styles.container}>
			<section
				ref={builderRef}
				className={styles.builder}
				aria-label={t("calendar:builder.label")}
			>
				<div className={styles.toolbar}>
					<SendouButton
						icon={<Plus />}
						onClick={addBracket}
						isDisabled={!canAddBracket}
						testId="builder-add-bracket-button"
					>
						{t("calendar:builder.newBracket")}
					</SendouButton>
					{/* in the toolbar instead of above the board so that showing them doesn't push it down */}
					{linkFromIdx !== null ? (
						<div className={styles.linkBar} role="status">
							<span>
								{t("calendar:builder.connectHint", {
									name: bracketName(linkFromIdx),
								})}
							</span>
							<SendouButton
								size="small"
								variant="outlined"
								onClick={() => setLinkFromIdx(null)}
							>
								{t("common:actions.cancel")}
							</SendouButton>
						</div>
					) : notice ? (
						<div className={styles.notice} role="status">
							<span>{notice}</span>
							<SendouButton
								size="small"
								variant="minimal"
								icon={<X />}
								aria-label={t("common:actions.close")}
								onClick={() => setNotice(null)}
							/>
						</div>
					) : (
						<span className={styles.toolbarHint}>
							<span className={styles.pointerOnly}>
								{t("calendar:builder.toolbarHint")}
							</span>
							<span className={styles.touchOnly}>
								{t("calendar:builder.toolbarHintTouch")}
							</span>
						</span>
					)}
				</div>

				{(["brackets", "progression"] as const).map((fieldName) =>
					errors[fieldName] ? (
						<FormMessage
							key={fieldName}
							id={errorMessageId(fieldName)}
							type="error"
						>
							{t(errors[fieldName] as never)}
						</FormMessage>
					) : null,
				)}

				<DndContext
					sensors={sensors}
					collisionDetection={cardsFirstCollisionDetection}
					onDragStart={handleDragStart}
					onDragMove={handleDragMove}
					onDragEnd={handleDragEnd}
					onDragCancel={() => setActiveDrag(null)}
				>
					<div ref={scrollerRef} className={styles.scroller}>
						<div
							className={styles.board}
							style={{ width: boardWidth, height: boardHeight }}
						>
							{Array.from({ length: columnCount }, (_, column) => (
								<BuilderColumn
									key={column}
									column={column}
									isNewColumn={column === usedColumnCount}
									isHovered={moveDrag?.hoveredColumn === column}
									height={boardHeight - BOARD_PADDING}
								/>
							))}

							<svg
								className={styles.lines}
								width={boardWidth}
								height={boardHeight}
								aria-hidden="true"
							>
								{lines.map((line, lineIdx) => {
									const key = lineKey(line);
									const d = linePath(layout.lines[lineIdx].points);
									const hasError = hasErrorWithin(
										`progression[${line.toIdx}].sources[${line.sourceIdx}]`,
									);

									return (
										<React.Fragment key={key}>
											<path
												className={clsx(styles.line, {
													[styles.lineSelected]: selectedLine === line,
													[styles.lineHighlighted]: highlightedLineKey === key,
													[styles.lineError]: hasError,
												})}
												d={d}
											/>
											{/* biome-ignore lint/a11y/noStaticElementInteractions: a wider target for the mouse, the line's label button does the same */}
											<path
												className={styles.lineHitArea}
												d={d}
												onMouseEnter={() => setHoveredLineKey(key)}
												onMouseLeave={() => setHoveredLineKey(null)}
												onClick={() => selectLine(line)}
											/>
										</React.Fragment>
									);
								})}
								{draftLine ? (
									<path
										className={clsx(styles.line, styles.lineDraft)}
										d={linePath([
											{ x: draftLine.startX, y: draftLine.startY },
											{ x: draftLine.endX, y: draftLine.endY },
										])}
									/>
								) : null}
							</svg>

							{values.brackets.map((bracket, bracketIdx) => {
								const isStarting = BracketBuilder.isStartingBracket(
									values,
									bracketIdx,
								);
								const incoming = lines.filter(
									(line) => line.toIdx === bracketIdx,
								);
								const maxTeams = maxTeamCounts[bracketIdx];
								const isLinkTarget =
									linkingFromIdx !== null &&
									canConnect(linkingFromIdx, bracketIdx);
								const hasError =
									hasErrorWithin(`brackets[${bracketIdx}]`) ||
									hasErrorWithin(`progression[${bracketIdx}]`);
								const meta = [
									...BracketBuilder.cardFacts(bracket, { isStarting }).map(
										(fact) => cardFactText(fact, t),
									),
									typeof maxTeams === "number"
										? t("calendar:builder.maxTeams", { count: maxTeams })
										: null,
								].filter((text) => text !== null);
								const timing = isStarting
									? []
									: [
											bracket.startTime
												? (isOnTournamentStartDay(bracket.startTime)
														? startTimeFormatter
														: startDateTimeFormatter
													).format(bracket.startTime)
												: null,
											bracket.requiresCheckIn
												? t("calendar:builder.checkIn")
												: null,
										].filter((text) => text !== null);

								return (
									<BracketCard
										// brackets have no stable id, their index is what the form values refer to
										key={bracketIdx}
										bracketIdx={bracketIdx}
										position={positions[bracketIdx]}
										onHeightChange={(height) =>
											setCardHeights((heights) => {
												if (heights[bracketIdx] === height) return heights;

												const newHeights = [...heights];
												newHeights[bracketIdx] = height;
												return newHeights;
											})
										}
										className={clsx({
											[styles.cardSelected]: selectedBracketIdx === bracketIdx,
											[styles.cardLinkTarget]: isLinkTarget,
											[styles.cardLinkSource]: linkingFromIdx === bracketIdx,
											[styles.cardLinkHovered]:
												connectDrag?.hoveredIdx === bracketIdx,
											[styles.cardLineHighlighted]:
												highlightedLine?.fromIdx === bracketIdx ||
												highlightedLine?.toIdx === bracketIdx,
											[styles.cardError]: hasError,
										})}
										hasInPort={!isStarting}
										port={
											linkingFromIdx !== null && linkingFromIdx !== bracketIdx
												? null
												: {
														isActive: linkingFromIdx === bracketIdx,
														label: t("calendar:builder.port", {
															name: bracketName(bracketIdx),
														}),
														onClick: () => {
															setNotice(null);
															setLinkFromIdx(
																linkFromIdx === bracketIdx ? null : bracketIdx,
															);
														},
													}
										}
										onClick={() => {
											if (linkFromIdx !== null) {
												connect(linkFromIdx, bracketIdx);
											} else {
												selectAndShowPanel({ kind: "bracket", bracketIdx });
												scrollColumnIntoBoardView(bracketColumns[bracketIdx]);
											}
										}}
									>
										<span className={styles.cardTop}>
											<span
												className={clsx(styles.typeBadge, styles[bracket.type])}
												title={t(`forms:options.format.${bracket.type}`)}
											>
												{BRACKET_TYPE_SHORT[bracket.type]}
											</span>
											<span className={styles.cardName}>
												{bracketName(bracketIdx)}
											</span>
											{hasError ? (
												<span className={styles.cardErrorBadge}>!</span>
											) : null}
										</span>
										{meta.length > 0 ? (
											<CardFacts texts={meta} className={styles.cardMeta} />
										) : null}
										{timing.length > 0 ? (
											<CardFacts texts={timing} className={styles.cardMeta} />
										) : null}
										<span
											className={clsx(styles.cardSource, {
												[styles.cardSourceWarning]:
													!isStarting && incoming.length === 0,
											})}
										>
											{isStarting
												? isInvitational
													? t("forms:progression.addedByOrganizer")
													: t("forms:progression.joinFromSignUp")
												: incoming.length === 0
													? t("calendar:builder.noSourcesShort")
													: incoming.length === 1
														? t("calendar:builder.fromOne", {
																name: bracketName(incoming[0].fromIdx),
															})
														: t("calendar:builder.fromMany", {
																count: incoming.length,
															})}
										</span>
									</BracketCard>
								);
							})}

							{lines.map((line, lineIdx) => {
								const key = lineKey(line);
								const { labelAt } = layout.lines[lineIdx];
								const isSelected = selectedLine === line;
								const hasError = hasErrorWithin(
									`progression[${line.toIdx}].sources[${line.sourceIdx}]`,
								);

								return (
									<button
										type="button"
										key={key}
										className={clsx(styles.linePill, {
											[styles.linePillSelected]: isSelected,
											[styles.linePillHighlighted]:
												highlightedLineKey === key && !isSelected,
											[styles.linePillError]: hasError && !isSelected,
										})}
										style={{ left: labelAt.x, top: labelAt.y }}
										onClick={() => selectLine(line)}
										onMouseEnter={() => setHoveredLineKey(key)}
										onMouseLeave={() => setHoveredLineKey(null)}
										onFocus={() => setHoveredLineKey(key)}
										onBlur={() => setHoveredLineKey(null)}
										aria-label={t("calendar:builder.editConnection", {
											from: bracketName(line.fromIdx),
											to: bracketName(line.toIdx),
										})}
										data-testid="builder-connection-pill"
									>
										<ConnectionLabel values={values} line={line} />
									</button>
								);
							})}
						</div>
					</div>
					<DragOverlay dropAnimation={null}>
						{moveDrag ? (
							<div className={clsx(styles.card, styles.cardOverlay)}>
								<span className={styles.cardButton}>
									<span className={styles.cardTop}>
										<span
											className={clsx(
												styles.typeBadge,
												styles[values.brackets[moveDrag.bracketIdx].type],
											)}
										>
											{
												BRACKET_TYPE_SHORT[
													values.brackets[moveDrag.bracketIdx].type
												]
											}
										</span>
										<span className={styles.cardName}>
											{bracketName(moveDrag.bracketIdx)}
										</span>
									</span>
								</span>
							</div>
						) : null}
					</DragOverlay>
				</DndContext>
			</section>

			{selectedBracketIdx !== null && values.brackets[selectedBracketIdx] ? (
				<aside
					ref={panelRef}
					className={styles.panel}
					aria-label={t("calendar:builder.panel")}
				>
					<BracketPanel
						key={selectedBracketIdx}
						values={values}
						bracketIdx={selectedBracketIdx}
						lines={lines}
						errors={errors}
						onClose={closePanel}
						onRemove={removeBracket}
						onFormatChange={fitPlacementsToBracketSettings}
					/>
				</aside>
			) : selectedLine ? (
				<aside
					ref={panelRef}
					className={styles.panel}
					aria-label={t("calendar:builder.panel")}
				>
					<ConnectionPanel
						key={`${selectedLine.toIdx}-${selectedLine.sourceIdx}`}
						values={values}
						line={selectedLine}
						lines={lines}
						errors={errors}
						maxTeams={maxTeamCounts[selectedLine.fromIdx]}
						bracketName={bracketName}
						onPlacementsChange={(placements) =>
							setPlacements(selectedLine, placements)
						}
						onClose={closePanel}
						onRemove={() => {
							commit(
								BracketBuilder.disconnect(
									values,
									selectedLine.toIdx,
									selectedLine.sourceIdx,
								),
							);
							setSelection({
								kind: "bracket",
								bracketIdx: selectedLine.toIdx,
							});
						}}
					/>
				</aside>
			) : null}
		</div>
	);
}

/** Edits one bracket: its name, format and settings. Its connections are edited by clicking their lines. */
function BracketPanel({
	values,
	bracketIdx,
	lines,
	errors,
	onClose,
	onRemove,
	onFormatChange,
}: {
	values: BracketBuilder.BuilderValues;
	bracketIdx: number;
	lines: BracketBuilder.Connection[];
	errors: Record<string, string | undefined>;
	onClose: () => void;
	onRemove: (bracketIdx: number) => void;
	onFormatChange: () => void;
}) {
	const { t } = useTranslation(["calendar"]);
	const { setValue } = useFormFieldContext();

	const hasIncoming = lines.some((line) => line.toIdx === bracketIdx);
	const sourcesErrorName = `progression[${bracketIdx}].sources`;
	// with lines the error shows in their view, see the field revealer
	const sourcesError = hasIncoming ? undefined : errors[sourcesErrorName];

	const renderContext: ArrayItemRenderContext = {
		index: bracketIdx,
		itemName: `brackets[${bracketIdx}]`,
		values: values.brackets[bracketIdx] as unknown as Record<string, unknown>,
		setItemField: (fieldName, fieldValue) =>
			setValue(`brackets[${bracketIdx}].${String(fieldName)}`, fieldValue),
		canRemove: bracketIdx !== 0,
		remove: () => onRemove(bracketIdx),
	};

	return (
		<div className={styles.panelContent}>
			<PanelHeader
				title={t("calendar:builder.editBracket")}
				onClose={onClose}
			/>
			{sourcesError ? (
				<FormMessage id={errorMessageId(sourcesErrorName)} type="error">
					{sourcesError === "forms:errors.required" ? (
						<>
							<span className={styles.pointerOnly}>
								{t("calendar:builder.noSources")}
							</span>
							<span className={styles.touchOnly}>
								{t("calendar:builder.noSourcesTouch")}
							</span>
						</>
					) : (
						t(sourcesError as never)
					)}
				</FormMessage>
			) : null}
			<BracketFields
				renderContext={renderContext}
				isDisabled={false}
				onFormatChange={onFormatChange}
			/>

			{bracketIdx !== 0 ? (
				<SendouButton
					variant="outlined-destructive"
					icon={<Trash />}
					onClick={() => onRemove(bracketIdx)}
					testId="builder-delete-bracket-button"
				>
					{t("calendar:builder.deleteBracket")}
				</SendouButton>
			) : null}
		</div>
	);
}

function ConnectionPanel({
	values,
	line,
	lines,
	errors,
	maxTeams,
	bracketName,
	onPlacementsChange,
	onClose,
	onRemove,
}: {
	values: BracketBuilder.BuilderValues;
	line: BracketBuilder.Connection;
	lines: BracketBuilder.Connection[];
	errors: Record<string, string | undefined>;
	maxTeams: number | null;
	bracketName: (bracketIdx: number) => string;
	onPlacementsChange: (placements: string) => void;
	onClose: () => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation(["calendar"]);
	const source = values.brackets[line.fromIdx];
	const sourcesErrorName = `progression[${line.toIdx}].sources`;
	const sourcesError = errors[sourcesErrorName];
	const placementsErrorName = `${sourcesErrorName}[${line.sourceIdx}].placements`;
	const placementsError = errors[placementsErrorName];
	const isEarlyAdvance = sourceBracketHasEarlyAdvance(values.brackets, {
		bracketIdx: String(line.fromIdx),
		placements: line.placements,
	});

	const taken = takenPlacements(lines, line, bracketName);

	return (
		<div className={styles.panelContent}>
			<PanelHeader title={t("calendar:builder.whoMovesOn")} onClose={onClose} />
			<div className={styles.route}>
				<span className={styles.routeBracket}>{bracketName(line.fromIdx)}</span>
				<ArrowRight size={14} aria-hidden="true" />
				<span className={styles.routeBracket}>{bracketName(line.toIdx)}</span>
			</div>

			{sourcesError ? (
				<FormMessage id={errorMessageId(sourcesErrorName)} type="error">
					{t(sourcesError as never)}
				</FormMessage>
			) : null}

			{isEarlyAdvance ? (
				<div className={styles.info}>
					{t("calendar:builder.hint.earlyAdvance", {
						wins: source.advanceThreshold,
					})}
				</div>
			) : (
				<>
					<PlacementPicker
						source={source}
						sourceName={bracketName(line.fromIdx)}
						maxTeams={maxTeams}
						placements={line.placements}
						taken={taken}
						onChange={onPlacementsChange}
					/>
					{placementsError ? (
						<FormMessage id={errorMessageId(placementsErrorName)} type="error">
							{t(placementsError as never)}
						</FormMessage>
					) : null}
				</>
			)}

			<SendouButton
				variant="outlined-destructive"
				icon={<Trash />}
				onClick={onRemove}
			>
				{t("calendar:builder.removeConnection")}
			</SendouButton>
		</div>
	);
}

/** Picks which teams of the source move on, by the round they reached rather than by placement numbers. */
function PlacementPicker({
	source,
	sourceName,
	maxTeams,
	placements,
	taken,
	onChange,
}: {
	source: BracketFormValue;
	sourceName: string;
	maxTeams: number | null;
	placements: string;
	taken: TakenPlacements;
	onChange: (placements: string) => void;
}) {
	const { t } = useTranslation(["calendar"]);
	const parsed = Progression.parsePlacements(placements) ?? {
		placements: [],
		rest: false,
	};
	const knockedOutRounds = BracketBuilder.knockedOutRoundOptions(source);
	const isKnockedOut =
		knockedOutRounds.length > 0 &&
		parsed.placements.some((placement) => placement < 0);
	const picked = new Set(parsed.placements);
	const highestPick = Math.max(0, ...parsed.placements);
	const tiers = BracketBuilder.placementTiers(source, maxTeams);
	const firstFreeTier = tiers.find((tier) => !taken.nameOf(tier.placement));

	const setPicks = (newPicks: number[], rest: boolean) =>
		onChange(
			Progression.placementsToString(
				newPicks.toSorted((a, b) => a - b),
				rest && newPicks.length > 0,
			),
		);

	const restSwitch = (
		<SendouSwitch
			isSelected={parsed.rest}
			onChange={(isSelected) => setPicks([...picked], isSelected)}
			isDisabled={
				!parsed.rest && (picked.size === 0 || taken.isAnyAfter(highestPick))
			}
			size="small"
		>
			<span className={styles.switchText}>
				<span>{t("calendar:builder.restPlacements")}</span>
				<span className={styles.switchInfo}>
					{t("calendar:builder.restPlacementsInfo")}
				</span>
			</span>
		</SendouSwitch>
	);

	const modeSwitcher =
		knockedOutRounds.length > 0 ? (
			<SendouChipRadioGroup>
				<SendouChipRadio
					name="placement-mode"
					value="top"
					checked={!isKnockedOut}
					onChange={() =>
						onChange(firstFreeTier ? String(firstFreeTier.placement) : "")
					}
				>
					{t("calendar:builder.mode.top")}
				</SendouChipRadio>
				<SendouChipRadio
					name="placement-mode"
					value="knockedOut"
					checked={isKnockedOut}
					onChange={() => onChange("-1,-2")}
				>
					{t("calendar:builder.mode.knockedOut")}
				</SendouChipRadio>
			</SendouChipRadioGroup>
		) : null;

	if (isKnockedOut) {
		const rounds = Math.max(...parsed.placements.map(Math.abs));

		return (
			<div className={styles.panelGroup}>
				{modeSwitcher}
				<FormMessage type="info">
					{t("calendar:builder.hint.knockedOut")}
				</FormMessage>
				<div className={styles.tiers} role="radiogroup">
					{knockedOutRounds.map((roundCount) => (
						<label key={roundCount} className={styles.tier}>
							<input
								type="radio"
								name="knocked-out-rounds"
								checked={rounds === roundCount}
								onChange={() =>
									onChange(
										Progression.placementsToString(
											Array.from(
												{ length: roundCount },
												(_, idx) => -(idx + 1),
											),
										),
									)
								}
							/>
							<span className={styles.tierPlacement}>
								{roundCount === 1
									? t("calendar:builder.knockedOutFirst")
									: t("calendar:builder.knockedOutRounds", {
											count: roundCount,
										})}
							</span>
						</label>
					))}
				</div>
			</div>
		);
	}

	if (source.type === "swiss") {
		const from = parsed.placements.length > 0 ? Math.min(...picked) : 1;
		const to = parsed.placements.length > 0 ? highestPick : from;
		const range = (start: number, end: number) =>
			Array.from({ length: end - start + 1 }, (_, idx) => start + idx);

		return (
			<div className={styles.panelGroup}>
				<FormMessage type="info">
					{Number(source.groupCount) > 1
						? t("calendar:builder.hint.swissGroups", {
								count: Number(source.groupCount),
							})
						: t("calendar:builder.hint.swiss", { name: sourceName })}
				</FormMessage>
				<div className={styles.rangeInputs}>
					<label>
						{t("calendar:builder.fromPlace")}
						<PlaceInput
							min={1}
							value={from}
							onCommit={(start) =>
								setPicks(range(start, Math.max(start, to)), parsed.rest)
							}
						/>
					</label>
					<label>
						{t("calendar:builder.toPlace")}
						<PlaceInput
							min={from}
							value={to}
							disabled={parsed.rest}
							onCommit={(end) => setPicks(range(from, end), parsed.rest)}
						/>
					</label>
				</div>
				{restSwitch}
			</div>
		);
	}

	const isRoundRobin = source.type === "round_robin";

	return (
		<div className={styles.panelGroup}>
			{modeSwitcher}
			{isRoundRobin ? null : (
				<FormMessage type="info">
					{BracketBuilder.isGrouped(source)
						? t("calendar:builder.hint.eliminationGroups")
						: maxTeams !== null
							? t("calendar:builder.hint.eliminationBounded", {
									name: sourceName,
									count: maxTeams,
								})
							: t("calendar:builder.hint.elimination")}
				</FormMessage>
			)}
			<div className={styles.tiers}>
				{tiers.map((tier) => {
					const isPicked = picked.has(tier.placement);
					const isIncludedByRest = parsed.rest && tier.placement > highestPick;
					const takenByName = taken.nameOf(tier.placement);
					const isTaken = Boolean(takenByName) && !isPicked;

					return (
						<label
							key={tier.placement}
							className={clsx(styles.tier, {
								[styles.tierPicked]: isPicked || isIncludedByRest,
								[styles.tierTaken]: isTaken,
							})}
						>
							<input
								type="checkbox"
								checked={isPicked || isIncludedByRest}
								disabled={isTaken || isIncludedByRest}
								onChange={() =>
									setPicks(
										isPicked
											? [...picked].filter((p) => p !== tier.placement)
											: [...picked, tier.placement],
										parsed.rest,
									)
								}
							/>
							<span className={styles.tierPlacement}>
								{t("calendar:builder.placement", { placement: tier.placement })}
							</span>
							<span className={styles.tierDescription}>
								{isTaken
									? t("calendar:builder.takenBy", { name: takenByName })
									: isIncludedByRest
										? t("calendar:builder.includedByRest")
										: t(`calendar:builder.tier.${tier.kind}`, {
												roundOf: tier.roundOf,
											})}
							</span>
							<span className={styles.tierTeams}>
								{isRoundRobin || tier.maxTeamsPerGroup === 1
									? t("calendar:builder.tierPerGroup")
									: typeof tier.maxTeamsPerGroup === "number"
										? t("calendar:builder.tierTeamsPerGroup", {
												count: tier.maxTeamsPerGroup,
											})
										: tier.maxTeams === 1
											? t("calendar:builder.tierOneTeam")
											: t("calendar:builder.tierTeams", {
													count: tier.maxTeams,
												})}
							</span>
						</label>
					);
				})}
			</div>
			{/* round robin tiers already list every placement a group can have, kept to let a saved "+" be turned off */}
			{isRoundRobin && !parsed.rest ? null : restSwitch}
		</div>
	);
}

function PlaceInput({
	value,
	min,
	disabled,
	onCommit,
}: {
	value: number;
	min: number;
	disabled?: boolean;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = React.useState<string | null>(null);

	const parse = (raw: string) => {
		const parsed = Number(raw);
		return raw !== "" && Number.isInteger(parsed) ? parsed : null;
	};

	return (
		<input
			type="number"
			min={min}
			value={draft ?? value}
			disabled={disabled}
			onChange={(event) => {
				setDraft(event.target.value);
				const parsed = parse(event.target.value);
				if (parsed !== null && parsed >= min) onCommit(parsed);
			}}
			onBlur={() => {
				if (draft === null) return;
				const parsed = parse(draft);
				const clamped = Math.max(min, parsed ?? value);
				if (clamped !== value) onCommit(clamped);
				setDraft(null);
			}}
		/>
	);
}

function PanelHeader({
	title,
	onClose,
}: {
	title: string;
	onClose: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.panelHeader}>
			<h3 className={styles.panelTitle}>{title}</h3>
			<SendouButton
				size="small"
				variant="minimal"
				icon={<X />}
				aria-label={t("common:actions.close")}
				onClick={onClose}
			/>
		</div>
	);
}

/** Short description of who moves along a line, e.g. "Top 4" or "Top 2 / group". */
function ConnectionLabel({
	values,
	line,
}: {
	values: BracketBuilder.BuilderValues;
	line: BracketBuilder.Connection;
}) {
	const { t } = useTranslation(["calendar"]);
	const source = values.brackets[line.fromIdx];
	if (
		sourceBracketHasEarlyAdvance(values.brackets, {
			bracketIdx: String(line.fromIdx),
			placements: line.placements,
		})
	) {
		return t("calendar:builder.label.earlyAdvancers", {
			wins: source.advanceThreshold,
		});
	}

	const parsed = Progression.parsePlacements(line.placements);
	if (!parsed) return line.placements;
	if (parsed.placements.length === 0) return t("calendar:builder.label.pick");

	const placements = parsed.placements.toSorted((a, b) => a - b);
	if (placements[0] < 0) {
		const rounds = Math.max(...placements.map(Math.abs));
		return rounds === 1
			? t("calendar:builder.label.knockedOutFirst")
			: t("calendar:builder.label.knockedOut", { count: rounds });
	}

	const isTopRun =
		!parsed.rest && placements.every((placement, idx) => placement === idx + 1);
	const asText = Progression.placementsToString([...placements], parsed.rest);

	if (source.type === "round_robin") {
		if (isTopRun && placements.length === 1) {
			return t("calendar:builder.label.groupWinners");
		}
		return isTopRun
			? t("calendar:builder.label.groupTop", { count: placements.length })
			: t("calendar:builder.label.perGroup", { placements: asText });
	}

	if (!isTopRun) return asText;

	if (source.type === "swiss") {
		return t("calendar:builder.label.top", { count: placements.length });
	}

	const pickedTiers = BracketBuilder.placementTiers(source).filter((tier) =>
		placements.includes(tier.placement),
	);

	if (BracketBuilder.isGrouped(source)) {
		const topTeams = R.sumBy(pickedTiers, (tier) => tier.maxTeamsPerGroup ?? 0);
		return topTeams === 1
			? t("calendar:builder.label.groupWinners")
			: t("calendar:builder.label.groupTop", { count: topTeams });
	}

	return t("calendar:builder.label.top", {
		count: R.sumBy(pickedTiers, (tier) => tier.maxTeams),
	});
}

/** Scrolls the page so the element starts near the top, unless its start is already in the upper half of the viewport. */
function scrollToStartIfOutOfView(element: HTMLElement | null) {
	if (!element) return;

	const { top } = element.getBoundingClientRect();
	if (top >= 0 && top <= window.innerHeight / 2) return;

	element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function lineKey(line: BracketBuilder.Connection) {
	return `${line.toIdx}-${line.sourceIdx}`;
}

/** Curves between columns, straight through the lanes, see `BracketBuilder.boardLayout` */
function linePath(points: Array<{ x: number; y: number }>) {
	const [start, ...rest] = points;
	const segments = rest.map((point, idx) => {
		if (idx % 2 === 1) return `L ${point.x} ${point.y}`;

		const previous = points[idx];
		const bend = Math.max(48, (point.x - previous.x) / 2);
		return `C ${previous.x + bend} ${previous.y}, ${point.x - bend} ${point.y}, ${point.x} ${point.y}`;
	});

	return `M ${start.x} ${start.y} ${segments.join(" ")}`;
}

function BuilderColumn({
	column,
	isNewColumn,
	isHovered,
	height,
}: {
	column: number;
	isNewColumn: boolean;
	isHovered: boolean;
	height: number;
}) {
	const { t } = useTranslation(["calendar"]);
	const { setNodeRef } = useDroppable({
		id: `column-${column}`,
		data: { kind: "column", column } satisfies DropData,
	});

	return (
		<div
			ref={setNodeRef}
			className={clsx(styles.column, {
				[styles.newColumn]: isNewColumn,
				[styles.columnHovered]: isHovered,
			})}
			style={{
				left:
					BOARD_PADDING +
					column * (CARD_WIDTH + COLUMN_GAP) -
					BOARD_PADDING / 2,
				height,
			}}
		>
			<div className={styles.columnHeader}>
				<span className={styles.columnTitle}>
					{column === 0
						? t("calendar:builder.column.starting")
						: isNewColumn
							? t("calendar:builder.column.new")
							: t("calendar:builder.column.followUp")}
				</span>
				<span className={styles.columnInfo}>
					{column === 0
						? t("calendar:builder.column.startingInfo")
						: isNewColumn
							? t("calendar:builder.column.newInfo")
							: t("calendar:builder.column.followUpInfo")}
				</span>
			</div>
		</div>
	);
}

/** A bracket of the board: dragged to move it between columns, its port dragged onto another card to connect them. */
function BracketCard({
	bracketIdx,
	position,
	className,
	hasInPort,
	port,
	onClick,
	onHeightChange,
	children,
}: {
	bracketIdx: number;
	position: { x: number; y: number };
	className: string;
	hasInPort: boolean;
	port: { isActive: boolean; label: string; onClick: () => void } | null;
	onClick: () => void;
	onHeightChange: (height: number) => void;
	children: React.ReactNode;
}) {
	const {
		setNodeRef: setDraggableRef,
		listeners,
		isDragging,
	} = useDraggable({
		id: `move-${bracketIdx}`,
		data: { kind: "move", bracketIdx } satisfies DragData,
		disabled: bracketIdx === 0,
	});
	const { setNodeRef: setDroppableRef } = useDroppable({
		id: `card-${bracketIdx}`,
		data: { kind: "card", bracketIdx } satisfies DropData,
	});

	return (
		<div
			ref={(node) => {
				setDraggableRef(node);
				setDroppableRef(node);
				if (!node) return;

				const observer = new ResizeObserver(([entry]) =>
					onHeightChange(entry.borderBoxSize[0].blockSize),
				);
				observer.observe(node);
				return () => {
					observer.disconnect();
					setDraggableRef(null);
					setDroppableRef(null);
				};
			}}
			className={clsx(styles.card, className, {
				[styles.cardMovable]: bracketIdx !== 0,
				[styles.cardDragging]: isDragging,
			})}
			style={{ left: position.x, top: position.y }}
			data-testid="builder-bracket-card"
			{...listeners}
		>
			{hasInPort ? <span className={styles.inPort} aria-hidden="true" /> : null}
			<button type="button" className={styles.cardButton} onClick={onClick}>
				{children}
			</button>
			{port ? <OutPort bracketIdx={bracketIdx} {...port} /> : null}
		</div>
	);
}

function OutPort({
	bracketIdx,
	isActive,
	label,
	onClick,
}: {
	bracketIdx: number;
	isActive: boolean;
	label: string;
	onClick: () => void;
}) {
	const { t } = useTranslation(["calendar"]);
	const { setNodeRef, listeners } = useDraggable({
		id: `connect-${bracketIdx}`,
		data: { kind: "connect", fromIdx: bracketIdx } satisfies DragData,
	});

	return (
		<button
			ref={setNodeRef}
			type="button"
			className={clsx(styles.outPort, {
				[styles.outPortActive]: isActive,
			})}
			title={t("calendar:builder.portTitle")}
			aria-label={label}
			onClick={onClick}
			{...listeners}
		/>
	);
}

/** Cards are inside columns, a card under the pointer wins over its column. */
const cardsFirstCollisionDetection: CollisionDetection = (args) => {
	const collisions = pointerWithin(args);
	const cardCollision = collisions.find(
		(collision) =>
			(collision.data?.droppableContainer.data.current as DropData | undefined)
				?.kind === "card",
	);

	return cardCollision ? [cardCollision] : collisions;
};

function draftLineOf(
	drag: Extract<ActiveDrag, { kind: "connect" }>,
	positions: BracketBuilder.BoardLayout["cards"],
) {
	const startX = positions[drag.fromIdx].x + CARD_WIDTH;
	const startY = positions[drag.fromIdx].y + positions[drag.fromIdx].height / 2;

	if (drag.hoveredIdx !== null) {
		return {
			startX,
			startY,
			endX: positions[drag.hoveredIdx].x,
			endY:
				positions[drag.hoveredIdx].y + positions[drag.hoveredIdx].height / 2,
		};
	}

	return {
		startX,
		startY,
		endX: startX + drag.grabOffset.x + drag.delta.x,
		endY: startY + drag.grabOffset.y + drag.delta.y,
	};
}

interface TakenPlacements {
	/** Bracket the placement already goes to through another line */
	nameOf: (placement: number) => string | undefined;
	isAnyAfter: (placement: number) => boolean;
}

/** Placements other lines from the same bracket already take. */
function takenPlacements(
	lines: BracketBuilder.Connection[],
	line: BracketBuilder.Connection,
	bracketName: (bracketIdx: number) => string,
): TakenPlacements {
	const byPlacement = new Map<number, string>();
	let rest: { after: number; name: string } | null = null;

	for (const other of lines) {
		if (other.fromIdx !== line.fromIdx || other === line) continue;
		const parsed = Progression.parsePlacements(other.placements);
		if (!parsed) continue;

		const name = bracketName(other.toIdx);
		for (const placement of parsed.placements) {
			byPlacement.set(placement, name);
		}
		if (parsed.rest) {
			rest = { after: Math.max(...parsed.placements), name };
		}
	}

	return {
		nameOf: (placement) =>
			byPlacement.get(placement) ??
			(rest && placement > rest.after ? rest.name : undefined),
		isAnyAfter: (placement) =>
			rest !== null ||
			[...byPlacement.keys()].some((taken) => taken > placement),
	};
}

function CardFacts({
	texts,
	className,
}: {
	texts: string[];
	className: string;
}) {
	return (
		<span className={className}>
			{texts.map((text, idx) => (
				<React.Fragment key={text}>
					{/* non-breaking space keeps the dot at the end of a line, never the start */}
					{idx > 0 ? "\u00a0· " : null}
					<span className={styles.cardFact}>{text}</span>
				</React.Fragment>
			))}
		</span>
	);
}

function cardFactText(
	fact: BracketBuilder.CardFact,
	t: TFunction<["calendar"]>,
) {
	switch (fact.type) {
		case "GROUPS":
			return t("calendar:builder.groupCount", { count: fact.count });
		case "TEAMS_PER_GROUP":
			return t("calendar:builder.fact.teamsPerGroup", { count: fact.count });
		case "AB_DIVISIONS":
			return t("calendar:builder.fact.abDivisions");
		case "ROUNDS":
			return t("calendar:builder.fact.rounds", { count: fact.count });
		case "EARLY_ADVANCE":
			return t("calendar:builder.fact.earlyAdvance", { wins: fact.wins });
		case "SKIPPED":
			return t(`calendar:builder.fact.skipped.${fact.round}`);
	}
}

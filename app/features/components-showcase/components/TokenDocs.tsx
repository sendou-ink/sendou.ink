import * as React from "react";
import { isDeepEqual } from "remeda";
import styles from "./TokenDocs.module.css";

const ARROW_HEAD_SIZE = 8;

type AnchorSide = "right" | "top" | "bottom";

export interface Note {
	id: string;
	tokens: string[];
	text: React.ReactNode;
	anchor?: AnchorSide;
}

export function DocSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="stack md">
			<h2 className={styles.sectionTitle}>{title}</h2>
			{children}
		</section>
	);
}

/** A token's name, with a swatch of it when it is a color */
export function TokenName({ token }: { token: string }) {
	return (
		<span className={styles.tokenName}>
			{token.startsWith("--color-") ? (
				<span
					className={styles.swatch}
					style={{ backgroundColor: `var(${token})` }}
				/>
			) : null}
			<code>{token}</code>
		</span>
	);
}

interface Point {
	x: number;
	y: number;
}

interface Rect extends Point {
	width: number;
	height: number;
}

interface NoteGeometry {
	id: string;
	side: AnchorSide;
	target: Rect;
	anchor: Point;
	start: Point;
}

interface AnnotationGeometry {
	isSideLayout: boolean;
	gutterX: number;
	notes: NoteGeometry[];
}

/** A mock (`children`) with numbered notes beside it, each pointing at its `data-note` element */
export function Annotated({
	notes,
	stageNote,
	children,
}: {
	notes: Note[];
	/** note id pointing at the stage itself */
	stageNote?: string;
	children: React.ReactNode;
}) {
	const markerId = React.useId();
	const containerRef = React.useRef<HTMLDivElement>(null);
	const stageRef = React.useRef<HTMLDivElement>(null);
	const labelsRef = React.useRef<HTMLOListElement>(null);
	const [geometry, setGeometry] = React.useState<AnnotationGeometry | null>(
		null,
	);
	const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);

	React.useLayoutEffect(() => {
		const container = containerRef.current;
		const stage = stageRef.current;
		const labels = labelsRef.current;
		if (!container || !stage || !labels) return;

		const measure = () => {
			const next = measureAnnotations({ container, stage, labels });
			setGeometry((previous) =>
				previous && isDeepEqual(previous, next) ? previous : next,
			);
		};

		const observer = new ResizeObserver(measure);
		observer.observe(container);
		for (const target of stage.querySelectorAll("[data-note]")) {
			observer.observe(target);
		}

		return () => observer.disconnect();
	}, []);

	const activeTarget = geometry?.notes.find(
		(note) => note.id === activeNoteId,
	)?.target;

	return (
		<div ref={containerRef} className={styles.annotated}>
			<div className={styles.annotatedGrid}>
				<div ref={stageRef} className={styles.stage} data-note={stageNote}>
					{children}
				</div>
				<ol ref={labelsRef} className={styles.notes}>
					{notes.map((note, index) => (
						<li
							key={note.id}
							data-note-label={note.id}
							data-note-anchor={note.anchor ?? "right"}
							data-active={note.id === activeNoteId}
							className={styles.note}
							onMouseEnter={() => setActiveNoteId(note.id)}
							onMouseLeave={() => setActiveNoteId(null)}
						>
							<span data-note-marker className={styles.marker}>
								{index + 1}
							</span>
							<div className="stack xs">
								{note.tokens.map((token) => (
									<TokenName key={token} token={token} />
								))}
								<span className="text-xs text-lighter">{note.text}</span>
							</div>
						</li>
					))}
				</ol>
			</div>

			{activeTarget ? (
				<div
					className={styles.targetHighlight}
					style={{
						left: activeTarget.x,
						top: activeTarget.y,
						width: activeTarget.width,
						height: activeTarget.height,
					}}
				/>
			) : null}

			{geometry?.isSideLayout ? (
				<svg className={styles.arrows} aria-hidden="true">
					<defs>
						{(["idle", "active"] as const).map((state) => (
							<marker
								key={state}
								id={`${markerId}-${state}`}
								viewBox="0 0 8 8"
								markerUnits="userSpaceOnUse"
								markerWidth={ARROW_HEAD_SIZE}
								markerHeight={ARROW_HEAD_SIZE}
								refX="0"
								refY="4"
								orient="auto"
							>
								<path
									d="M0,0 L8,4 L0,8 z"
									className={styles.arrowHead}
									data-active={state === "active"}
								/>
							</marker>
						))}
					</defs>
					{geometry.notes.map((note) => {
						const isActive = note.id === activeNoteId;

						return (
							<path
								key={note.id}
								d={arrowPath(note, geometry.gutterX)}
								className={styles.arrow}
								data-active={isActive}
								markerEnd={`url(#${markerId}-${isActive ? "active" : "idle"})`}
							/>
						);
					})}
				</svg>
			) : (
				geometry?.notes.map((note) => (
					<span
						key={note.id}
						className={styles.pin}
						style={{ left: note.anchor.x, top: note.anchor.y }}
						aria-hidden="true"
					>
						{notes.findIndex((candidate) => candidate.id === note.id) + 1}
					</span>
				))
			)}
		</div>
	);
}

function measureAnnotations({
	container,
	stage,
	labels,
}: {
	container: HTMLElement;
	stage: HTMLElement;
	labels: HTMLElement;
}): AnnotationGeometry {
	const origin = container.getBoundingClientRect();
	const relative = (element: Element): Rect => {
		const rect = element.getBoundingClientRect();
		return {
			x: Math.round(rect.left - origin.left),
			y: Math.round(rect.top - origin.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		};
	};

	const notes: NoteGeometry[] = [];
	for (const label of labels.querySelectorAll<HTMLElement>(
		"[data-note-label]",
	)) {
		const id = label.dataset.noteLabel;
		const target =
			stage.dataset.note === id
				? stage
				: stage.querySelector(`[data-note="${id}"]`);
		const marker = label.querySelector("[data-note-marker]");
		if (!id || !target || !marker) continue;

		const side = (label.dataset.noteAnchor ?? "right") as AnchorSide;
		const targetRect = relative(target);
		const markerRect = relative(marker);

		notes.push({
			id,
			side,
			target: targetRect,
			anchor: anchorPoint(targetRect, side),
			start: { x: markerRect.x - 4, y: markerRect.y + markerRect.height / 2 },
		});
	}

	const stageRight = stage.getBoundingClientRect().right;
	const labelsLeft = labels.getBoundingClientRect().left;

	return {
		isSideLayout: labelsLeft >= stageRight,
		gutterX: Math.round(
			stageRight - origin.left + (labelsLeft - stageRight) / 4,
		),
		notes,
	};
}

function anchorPoint(rect: Rect, side: AnchorSide): Point {
	switch (side) {
		case "top":
			return { x: rect.x + rect.width / 2, y: rect.y };
		case "bottom":
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
		case "right":
			return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
	}
}

/** S-curves through the gap between stage and notes, entering a right anchor horizontally so the arrow doesn't cross content. Ends in a straight stub so the head lines up with it */
function arrowPath({ start, anchor, side }: NoteGeometry, gutterX: number) {
	const midX = (start.x + gutterX) / 2;
	const verticalBend = 36;

	if (side === "right") {
		return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${anchor.y}, ${gutterX} ${anchor.y} L ${anchor.x + ARROW_HEAD_SIZE} ${anchor.y}`;
	}

	const direction = side === "top" ? -1 : 1;
	const lineEndY = anchor.y + direction * ARROW_HEAD_SIZE;
	const curveEndY = lineEndY + direction * ARROW_HEAD_SIZE;
	const controlY = curveEndY + direction * verticalBend;

	return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${anchor.x} ${controlY}, ${anchor.x} ${curveEndY} L ${anchor.x} ${lineEndY}`;
}

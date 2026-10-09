/**
 * Coach mode's pen over the paused frame, video or map, in the color picked
 * from the top right corner. The drawing is the frame's only, so it is meant
 * to be keyed by it and dropped once playback continues.
 */
import { Eraser } from "lucide-react";
import { type PointerEvent, useState } from "react";
import styles from "./CoachDrawing.module.css";

const COLORS = [
	{ value: "#ff3b30", label: "Red" },
	{ value: "#ffd60a", label: "Yellow" },
	{ value: "#0a84ff", label: "Blue" },
] as const;

type Color = (typeof COLORS)[number]["value"];

interface Stroke {
	color: Color;
	/** x and y as fractions of the frame's width and height */
	points: Array<[number, number]>;
}

export function CoachDrawing() {
	const [color, setColor] = useState<Color>(COLORS[0].value);
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [isDrawing, setIsDrawing] = useState(false);

	const startStroke = (event: PointerEvent<SVGSVGElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsDrawing(true);
		setStrokes([...strokes, { color, points: [pointOf(event)] }]);
	};

	const continueStroke = (event: PointerEvent<SVGSVGElement>) => {
		if (!isDrawing) return;
		const point = pointOf(event);
		setStrokes((current) => {
			const last = current.at(-1);
			if (!last) return current;
			return [
				...current.slice(0, -1),
				{ ...last, points: [...last.points, point] },
			];
		});
	};

	return (
		<div className={styles.drawing}>
			<svg
				className={styles.canvas}
				viewBox="0 0 1 1"
				preserveAspectRatio="none"
				aria-hidden
				onPointerDown={startStroke}
				onPointerMove={continueStroke}
				onPointerUp={() => setIsDrawing(false)}
				onPointerCancel={() => setIsDrawing(false)}
			>
				{strokes.map((stroke, index) => (
					<polyline
						key={index}
						points={stroke.points.map((point) => point.join(",")).join(" ")}
						stroke={stroke.color}
						className={styles.stroke}
					/>
				))}
			</svg>
			<div className={styles.tools}>
				{COLORS.map((option) => (
					<button
						key={option.value}
						type="button"
						className={styles.color}
						style={{ backgroundColor: option.value }}
						aria-label={`Draw in ${option.label.toLowerCase()}`}
						aria-pressed={color === option.value}
						title={`Draw in ${option.label.toLowerCase()}`}
						onClick={() => setColor(option.value)}
					/>
				))}
				{strokes.length > 0 ? (
					<button
						type="button"
						className={styles.clear}
						aria-label="Clear the drawing"
						title="Clear the drawing"
						onClick={() => setStrokes([])}
					>
						<Eraser size={12} />
					</button>
				) : null}
			</div>
		</div>
	);
}

function pointOf(event: PointerEvent<SVGSVGElement>): [number, number] {
	const rect = event.currentTarget.getBoundingClientRect();
	return [
		(event.clientX - rect.left) / rect.width,
		(event.clientY - rect.top) / rect.height,
	];
}

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export type Placement =
	| "top"
	| "bottom"
	| "right"
	| "bottom start"
	| "bottom end";

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	top: number;
	left: number;
}

export interface Bounds {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface Resolution {
	side: Side;
	align: Align;
	availableWidth: number;
	availableHeight: number;
	transformOrigin: string;
}

export interface Insets {
	top: number | null;
	right: number | null;
	bottom: number | null;
	left: number | null;
}

const OPPOSITE_SIDE: Record<Side, Side> = {
	top: "bottom",
	bottom: "top",
	left: "right",
	right: "left",
};

const ALIGN_ORIGIN: Record<Align, string> = {
	start: "0%",
	center: "50%",
	end: "100%",
};

export function resolve({
	anchor,
	floating,
	bounds,
	placement,
	gap,
	padding,
	rtl,
}: {
	anchor: Rect;
	floating: Size;
	bounds: Bounds;
	placement: Placement;
	gap: number;
	padding: number;
	rtl: boolean;
}): Resolution {
	const { side: preferred, align } = parsePlacement(placement);

	const space = spaceAround(anchor, bounds, gap, padding);
	const opposite = OPPOSITE_SIDE[preferred];
	const needed = isVertical(preferred) ? floating.height : floating.width;
	const across = spaceAcross(bounds, placement, padding);

	const side =
		needed <= space[preferred] || space[preferred] >= space[opposite]
			? preferred
			: opposite;

	return {
		side,
		align,
		availableWidth: Math.max(0, isVertical(side) ? across : space[side]),
		availableHeight: Math.max(0, isVertical(side) ? space[side] : across),
		transformOrigin: transformOrigin(side, align, rtl),
	};
}

export function spaceAcross(
	bounds: Bounds,
	placement: Placement,
	padding: number,
) {
	const size = isVerticalPlacement(placement)
		? bounds.right - bounds.left
		: bounds.bottom - bounds.top;

	return Math.max(0, size - 2 * padding);
}

export function isVerticalPlacement(placement: Placement) {
	return isVertical(parsePlacement(placement).side);
}

export function insets({
	anchor,
	floating,
	bounds,
	side,
	align,
	gap,
	padding,
	rtl,
	viewport,
}: {
	anchor: Rect;
	floating: Size;
	bounds: Bounds;
	side: Side;
	align: Align;
	gap: number;
	padding: number;
	rtl: boolean;
	viewport: Size;
}): Insets {
	if (isVertical(side)) {
		const left = clamp(
			alignedStart(
				anchor.left,
				anchor.width,
				floating.width,
				physicalAlign(align, rtl),
			),
			bounds.left + padding,
			bounds.right - padding - floating.width,
		);

		return side === "bottom"
			? {
					top: anchor.top + anchor.height + gap,
					right: null,
					bottom: null,
					left,
				}
			: {
					top: null,
					right: null,
					bottom: viewport.height - (anchor.top - gap),
					left,
				};
	}

	const top = clamp(
		alignedStart(anchor.top, anchor.height, floating.height, align),
		bounds.top + padding,
		bounds.bottom - padding - floating.height,
	);

	return side === "right"
		? { top, right: null, bottom: null, left: anchor.left + anchor.width + gap }
		: {
				top,
				right: viewport.width - (anchor.left - gap),
				bottom: null,
				left: null,
			};
}

export function documentInsets(
	viewportInsets: Insets,
	scroll: { x: number; y: number },
): Insets {
	const { top, right, bottom, left } = viewportInsets;

	return {
		top: top === null ? null : top + scroll.y,
		right: right === null ? null : right - scroll.x,
		bottom: bottom === null ? null : bottom - scroll.y,
		left: left === null ? null : left + scroll.x,
	};
}

function parsePlacement(placement: Placement): { side: Side; align: Align } {
	const [side, align = "center"] = placement.split(" ") as [Side, Align?];
	return { side, align };
}

function isVertical(side: Side) {
	return side === "top" || side === "bottom";
}

function spaceAround(
	anchor: Rect,
	bounds: Bounds,
	gap: number,
	padding: number,
): Record<Side, number> {
	const taken = gap + padding;

	return {
		top: anchor.top - bounds.top - taken,
		bottom: bounds.bottom - (anchor.top + anchor.height) - taken,
		left: anchor.left - bounds.left - taken,
		right: bounds.right - (anchor.left + anchor.width) - taken,
	};
}

function alignedStart(
	anchorStart: number,
	anchorSize: number,
	floatingSize: number,
	align: Align,
) {
	if (align === "start") return anchorStart;
	if (align === "end") return anchorStart + anchorSize - floatingSize;
	return anchorStart + anchorSize / 2 - floatingSize / 2;
}

function physicalAlign(align: Align, rtl: boolean): Align {
	if (!rtl || align === "center") return align;
	return align === "start" ? "end" : "start";
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max));
}

function transformOrigin(side: Side, align: Align, rtl: boolean) {
	if (isVertical(side)) {
		const x = ALIGN_ORIGIN[physicalAlign(align, rtl)];
		return side === "bottom" ? `${x} 0%` : `${x} 100%`;
	}

	const y = ALIGN_ORIGIN[align];
	return side === "right" ? `0% ${y}` : `100% ${y}`;
}

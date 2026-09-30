export type FocusMove = "first" | "last" | "next" | "previous";

/**
 * Index a roving focus lands on after `move`. `currentIndex` is -1 when
 * nothing in the group is focused yet, in which case "next" lands on the first
 * item and "previous" on the last.
 */
export function rovingFocusIndex(
	move: FocusMove,
	currentIndex: number,
	length: number,
	{ wrap }: { wrap: boolean },
) {
	const lastIndex = length - 1;
	if (move === "first") return 0;
	if (move === "last") return lastIndex;

	if (currentIndex === -1) return move === "next" ? 0 : lastIndex;

	const offset = move === "next" ? 1 : -1;
	return wrap
		? (currentIndex + offset + length) % length
		: Math.min(Math.max(currentIndex + offset, 0), lastIndex);
}

/** The focus move a navigation key stands for in a group laid out along `orientation`, or null for any other key. */
export function focusMoveForKey(
	key: string,
	orientation: "horizontal" | "vertical" = "vertical",
): FocusMove | null {
	const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
	const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

	if (key === nextKey) return "next";
	if (key === previousKey) return "previous";
	if (key === "Home") return "first";
	if (key === "End") return "last";
	return null;
}

import clsx from "clsx";
import type * as React from "react";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import { useDragToScroll } from "~/hooks/useDragToScroll";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import type { Bracket as BracketType } from "../../core/Bracket";
import { EliminationBracketSide } from "./Elimination";
import styles from "./index.module.css";
import { RoundRobinBracket } from "./RoundRobin";
import { SwissBracket } from "./Swiss";

export function Bracket({
	bracket,
	bracketIdx,
	groupId,
}: {
	bracket: BracketType;
	bracketIdx: number;
	/** Group whose matches were loaded, for the bracket types shown one group at a time. */
	groupId?: number | null;
}) {
	const { bracketExpanded } = useBracketExpanded();

	if (bracket.type === "round_robin") {
		return (
			<BracketContainer>
				<RoundRobinBracket bracket={bracket} />
			</BracketContainer>
		);
	}

	if (bracket.type === "swiss") {
		return (
			<BracketContainer>
				<SwissBracket
					bracket={bracket}
					bracketIdx={bracketIdx}
					groupId={groupId}
				/>
			</BracketContainer>
		);
	}

	if (bracket.type === "single_elimination") {
		return (
			<BracketContainer scrollable>
				<EliminationBracketSide
					type="single"
					bracket={bracket}
					isExpanded={bracketExpanded}
				/>
			</BracketContainer>
		);
	}

	return (
		<BracketContainer scrollable>
			<EliminationBracketSide
				type="winners"
				bracket={bracket}
				isExpanded={bracketExpanded}
			/>
			<EliminationBracketSide
				type="losers"
				bracket={bracket}
				isExpanded={bracketExpanded}
			/>
		</BracketContainer>
	);
}

function BracketContainer({
	children,
	scrollable = false,
}: {
	children: React.ReactNode;
	scrollable?: boolean;
}) {
	if (!scrollable) {
		return (
			<div className={styles.bracket} data-testid="brackets-viewer">
				{children}
			</div>
		);
	}

	return <ScrollableBracketContainer>{children}</ScrollableBracketContainer>;
}

function ScrollableBracketContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	const ref = useDragToScroll<HTMLDivElement>();
	usePublishBracketTopOffset(ref);

	return (
		<div className={styles.breakoutWrapper}>
			<div
				className={clsx(styles.bracket, styles.scrollingBracket)}
				data-testid="brackets-viewer"
				ref={ref}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * Inside a breakout container (see `mainBreakout`), publishes the bracket's
 * distance from the top of the viewport as the `--bracket-fill-top` CSS
 * variable. The bracket's `max-height` is then derived from it in CSS, which
 * can account for the viewport, the mobile bottom nav and safe area insets in
 * ways JS can't read. A no-op elsewhere, so the static `max-height` applies.
 */
function usePublishBracketTopOffset(ref: React.RefObject<HTMLElement | null>) {
	useIsomorphicLayoutEffect(() => {
		const el = ref.current;
		if (!el?.closest("[data-main-breakout]")) return;

		const update = () => {
			el.style.setProperty(
				"--bracket-fill-top",
				`${el.getBoundingClientRect().top}px`,
			);
		};

		update();

		const observer = new ResizeObserver(update);
		observer.observe(document.body);
		window.addEventListener("resize", update);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
		};
	}, [ref]);
}

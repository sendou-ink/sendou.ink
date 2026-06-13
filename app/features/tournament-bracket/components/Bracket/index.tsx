import clsx from "clsx";
import * as React from "react";
import { useDraggable } from "react-use-draggable-scroll";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import type { Bracket as BracketType } from "../../core/Bracket";
import styles from "./bracket.module.css";
import { EliminationBracketSide } from "./Elimination";
import { RoundRobinBracket } from "./RoundRobin";
import { SwissBracket } from "./Swiss";

export function Bracket({
	bracket,
	bracketIdx,
}: {
	bracket: BracketType;
	bracketIdx: number;
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
				<SwissBracket bracket={bracket} bracketIdx={bracketIdx} />
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
	const ref = React.useRef<HTMLDivElement>(
		null,
	) as React.MutableRefObject<HTMLDivElement>;
	const { events } = useDraggable(ref, {
		applyRubberBandEffect: true,
	});
	usePublishBracketTopOffset(ref);

	return (
		<div className={styles.breakoutWrapper}>
			<div
				className={clsx(styles.bracket, styles.scrollingBracket)}
				data-testid="brackets-viewer"
				ref={ref}
				{...events}
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

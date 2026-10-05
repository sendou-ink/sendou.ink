import clsx from "clsx";
import type * as React from "react";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import { useDragToScroll } from "~/hooks/useDragToScroll";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import type { Bracket as BracketType } from "../../core/Bracket";
import { EliminationBracketSide } from "./Elimination";
import { GroupTabs } from "./GroupTabs";
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

	// group of the shipped matches rather than the search param's, so a switch shows once its matches loaded
	const selectedGroupId = groupId ?? bracket.data.group[0]?.id;

	return (
		<div className="stack lg">
			{typeof selectedGroupId === "number" ? (
				<GroupTabs bracket={bracket} selectedGroupId={selectedGroupId} />
			) : null}
			<BracketContainer scrollable>
				{bracket.type === "single_elimination" ? (
					<EliminationBracketSide
						type="single"
						bracket={bracket}
						groupId={selectedGroupId}
						isExpanded={bracketExpanded}
					/>
				) : (
					<>
						<EliminationBracketSide
							type="winners"
							bracket={bracket}
							groupId={selectedGroupId}
							isExpanded={bracketExpanded}
						/>
						<EliminationBracketSide
							type="losers"
							bracket={bracket}
							groupId={selectedGroupId}
							isExpanded={bracketExpanded}
						/>
					</>
				)}
			</BracketContainer>
		</div>
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
 * Inside a breakout container (see `mainBreakout`) publishes the bracket's distance from the viewport top
 * as `--bracket-fill-top`, from which CSS derives `max-height` accounting for the mobile bottom nav and
 * safe area insets JS can't read. No-op elsewhere, so the static `max-height` applies.
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

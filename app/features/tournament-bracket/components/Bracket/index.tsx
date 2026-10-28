import clsx from "clsx";
import * as React from "react";
import { useLocation, useNavigationType } from "react-router";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import { useDragToScroll } from "~/hooks/useDragToScroll";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import type { Bracket as BracketType } from "../../core/Bracket";
import type { MatchExitGroupsById } from "../../core/Bracket/Bracket";
import type { BracketsPageState } from "../../routes/to.$id.brackets";
import { bracketScrollPositionPersisted } from "../../tournament-bracket-persisted";
import { EliminationBracketSide } from "./Elimination";
import { GroupTabs } from "./GroupTabs";
import styles from "./index.module.css";
import { RoundRobinBracket } from "./RoundRobin";
import { SwissBracket } from "./Swiss";

export function Bracket({
	bracket,
	bracketIdx,
	groupId,
	exitGroups,
}: {
	bracket: BracketType;
	bracketIdx: number;
	/** Group whose matches were loaded, for the bracket types shown one group at a time. */
	groupId?: number | null;
	exitGroups?: MatchExitGroupsById;
}) {
	const { bracketExpanded } = useBracketExpanded();
	// the resolved view rather than the URL: `?idx=0` and no param show the same bracket
	const scrollMemoryKey = `${bracket.tournament.ctx.id}-${bracketIdx}-${
		groupId ?? bracket.data.group[0]?.id
	}`;

	if (bracket.type === "round_robin") {
		return (
			<BracketContainer scrollMemoryKey={scrollMemoryKey}>
				<RoundRobinBracket bracket={bracket} />
			</BracketContainer>
		);
	}

	if (bracket.type === "swiss") {
		return (
			<BracketContainer scrollMemoryKey={scrollMemoryKey}>
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
			<BracketContainer scrollMemoryKey={scrollMemoryKey} scrollable>
				{bracket.type === "single_elimination" ? (
					<EliminationBracketSide
						type="single"
						bracket={bracket}
						groupId={selectedGroupId}
						isExpanded={bracketExpanded}
						exitGroups={exitGroups}
					/>
				) : (
					<>
						<EliminationBracketSide
							type="winners"
							bracket={bracket}
							groupId={selectedGroupId}
							isExpanded={bracketExpanded}
							exitGroups={exitGroups}
						/>
						<EliminationBracketSide
							type="losers"
							bracket={bracket}
							groupId={selectedGroupId}
							isExpanded={bracketExpanded}
							exitGroups={exitGroups}
						/>
					</>
				)}
			</BracketContainer>
		</div>
	);
}

interface BracketContainerProps {
	children: React.ReactNode;
	/** Identifies the bracket view whose scroll position is remembered. */
	scrollMemoryKey: string;
}

function BracketContainer({
	scrollable = false,
	...rest
}: BracketContainerProps & { scrollable?: boolean }) {
	if (!scrollable) {
		return <StaticBracketContainer {...rest} />;
	}

	return <ScrollableBracketContainer {...rest} />;
}

function StaticBracketContainer({
	children,
	scrollMemoryKey,
}: BracketContainerProps) {
	const ref = React.useRef<HTMLDivElement>(null);
	useBracketScrollMemory(ref, scrollMemoryKey);

	return (
		<div
			className={styles.bracket}
			data-testid="brackets-viewer"
			data-bracket-container
			ref={ref}
		>
			{children}
		</div>
	);
}

function ScrollableBracketContainer({
	children,
	scrollMemoryKey,
}: BracketContainerProps) {
	const ref = useDragToScroll<HTMLDivElement>();
	usePublishBracketTopOffset(ref);
	useBracketScrollMemory(ref, scrollMemoryKey);

	return (
		<div className={styles.breakoutWrapper}>
			<div
				className={clsx(styles.bracket, styles.scrollingBracket)}
				data-testid="brackets-viewer"
				data-bracket-container
				data-bracket-scroller
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

/**
 * Remembers where the bracket view was left: the container's own scroll position always and
 * the window's too when coming back via a match link (`<ScrollRestoration />` only restores the window, on back/forward and reload).
 */
function useBracketScrollMemory(
	ref: React.RefObject<HTMLElement | null>,
	key: string,
) {
	const location = useLocation();
	const navigationType = useNavigationType();
	const isBackFromMatch =
		navigationType !== "POP" &&
		typeof (location.state as BracketsPageState | null)?.scrollToMatchId ===
			"number";

	useIsomorphicLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		const saved = PersistedState.readMap(bracketScrollPositionPersisted)[key];
		if (saved && (navigationType === "POP" || isBackFromMatch)) {
			el.scrollLeft = saved.left;
			el.scrollTop = saved.top;
			if (isBackFromMatch) window.scrollTo(0, saved.windowY);
		}

		// tracked as it happens: by the time of unmount the element no longer reports its scroll
		let position = {
			left: el.scrollLeft,
			top: el.scrollTop,
			windowY: window.scrollY,
		};
		const track = () => {
			position = {
				left: el.scrollLeft,
				top: el.scrollTop,
				windowY: window.scrollY,
			};
		};
		const save = () => {
			PersistedState.writeMapEntry(
				bracketScrollPositionPersisted,
				key,
				position,
			);
		};

		el.addEventListener("scroll", track, { passive: true });
		window.addEventListener("scroll", track, { passive: true });
		window.addEventListener("pagehide", save);
		return () => {
			el.removeEventListener("scroll", track);
			window.removeEventListener("scroll", track);
			window.removeEventListener("pagehide", save);
			save();
		};
	}, [ref, key, navigationType, isBackFromMatch]);
}

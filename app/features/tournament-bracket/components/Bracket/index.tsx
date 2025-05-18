import * as React from "react";
import { useDraggable } from "react-use-draggable-scroll";
import { useBracketExpanded } from "~/features/tournament/routes/to.$id";
import type { Bracket as BracketType } from "../../core/Bracket";
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
			<div className="bracket" data-testid="brackets-viewer">
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

	return (
		<div
			className="bracket scrolling-bracket"
			data-testid="brackets-viewer"
			ref={ref}
			{...events}
		>
			{children}
		</div>
	);
}

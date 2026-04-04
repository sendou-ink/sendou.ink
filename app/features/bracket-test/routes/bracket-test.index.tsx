import { useOutletContext } from "react-router";
import { Bracket } from "~/features/tournament-bracket/components/Bracket";
import type { Bracket as BracketType } from "~/features/tournament-bracket/core/Bracket";

export default function BracketTestIndex() {
	const { bracket } = useOutletContext<{ bracket: BracketType }>();

	return <Bracket bracket={bracket} bracketIdx={0} />;
}

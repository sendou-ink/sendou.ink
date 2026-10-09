import clsx from "clsx";
import { SendouButton } from "~/components/elements/Button";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { Bracket as BracketType } from "../../core/Bracket";
import { tournamentBracketsSearchParams } from "../../tournament-bracket-search-params";
import { groupNumberToLetters } from "../../tournament-bracket-utils";
import styles from "./GroupTabs.module.css";

/** Switches the group shown of a bracket whose groups are viewed one at a time. Nothing with only one group. */
export function GroupTabs({
	bracket,
	selectedGroupId,
}: {
	bracket: BracketType;
	selectedGroupId: number;
}) {
	const [, setSelectedGroupId] = useSearchParam(
		tournamentBracketsSearchParams,
		"group",
	);

	const groups = bracketGroups(bracket);
	if (groups.length <= 1) return null;

	return (
		<div className="stack horizontal">
			{groups.map((group) => (
				<SendouButton
					key={group.groupId}
					onClick={() => setSelectedGroupId(group.groupId)}
					className={clsx(styles.groupTab, styles.groupTabBig, {
						[styles.groupTabSelected]: selectedGroupId === group.groupId,
					})}
					data-testid={`group-${group.letters}-button`}
				>
					{group.letters}
				</SendouButton>
			))}
		</div>
	);
}

/** Groups of the bracket with their letters, e.g. "A" for the first. */
export function bracketGroups(bracket: BracketType) {
	return bracket.data.group.map((group) => ({
		letters: groupNumberToLetters(group.number),
		groupId: group.id,
	}));
}

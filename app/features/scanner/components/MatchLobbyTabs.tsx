/**
 * Lobby tabs over the match feed: private battles (the games /ingest cares
 * about) split from X Battles and everything else, so a scan that picked up
 * ranked play between tournament sets stays readable. Sets are a private
 * battle concept — consecutive games between the same two teams — so only
 * that tab gets set dividers, and set numbers are assigned within the tab.
 */

import { Fragment, useEffect, useRef } from "react";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import type { DetectedEvent } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import { assignMatchSets } from "../core/match-sets";
import type { ScannerLobby } from "../scanner-types";
import { SetDivider } from "./MatchCard";
import styles from "./MatchLobbyTabs.module.css";

type LobbyGroup = "private" | "x" | "other";

const LOBBY_GROUPS: LobbyGroup[] = ["private", "x", "other"];

const LOBBY_GROUP_LABELS: Record<LobbyGroup, string> = {
	private: "Private Battle",
	x: "X Battle",
	other: "Other",
};

const NO_KEYS: ReadonlySet<React.Key> = new Set();

export function MatchLobbyTabs<E extends DetectedEvent>({
	matches,
	keyOf,
	renderMatch,
}: {
	/** built matches in chronological order (oldest first) */
	matches: readonly BuiltMatch<E>[];
	/** stable render key for one match, typically its first source event's id */
	keyOf: (built: BuiltMatch<E>) => React.Key;
	/** `justFormed`: the match appeared while the page was open (enter animation) */
	renderMatch: (built: BuiltMatch<E>, justFormed: boolean) => React.ReactNode;
}) {
	const justFormedKeys = useJustFormedKeys(matches.map(keyOf));

	const groups = LOBBY_GROUPS.map((group) => ({
		group,
		matches: matches.filter((built) => lobbyGroup(built.match.lobby) === group),
	})).filter(({ matches: groupMatches }) => groupMatches.length > 0);

	if (groups.length === 0) return null;

	return (
		<SendouTabs>
			<SendouTabList>
				{groups.map(({ group, matches: groupMatches }) => (
					<SendouTab key={group} id={group} number={groupMatches.length}>
						{LOBBY_GROUP_LABELS[group]}
					</SendouTab>
				))}
			</SendouTabList>
			{groups.map(({ group, matches: groupMatches }) => (
				<SendouTabPanel key={group} id={group} className={styles.matchList}>
					<MatchList
						matches={groupMatches}
						sets={group === "private"}
						keyOf={keyOf}
						justFormedKeys={justFormedKeys}
						renderMatch={renderMatch}
					/>
				</SendouTabPanel>
			))}
		</SendouTabs>
	);
}

function lobbyGroup(lobby: ScannerLobby | null): LobbyGroup {
	if (lobby === "PRIVATE") return "private";
	if (lobby === "X") return "x";
	return "other";
}

/**
 * Keys of the matches that showed up since the previous render — the ones a
 * scan just formed. A list arriving whole (the live feed loaded from storage,
 * a saved VoD opened) is not "just formed": every card would animate in at
 * once for something the user did not watch happen.
 */
function useJustFormedKeys(keys: React.Key[]): ReadonlySet<React.Key> {
	const seenRef = useRef<Set<React.Key> | null>(null);
	const seen = seenRef.current;

	// after commit, not during render: under StrictMode the render runs twice
	// and the second pass would find every key already seen
	useEffect(() => {
		seenRef.current = new Set(keys);
	});

	if (seen === null) return NO_KEYS;
	const justFormed = keys.filter((key) => !seen.has(key));
	return justFormed.length === keys.length && keys.length > 1
		? NO_KEYS
		: new Set(justFormed);
}

function MatchList<E extends DetectedEvent>({
	matches,
	sets,
	keyOf,
	justFormedKeys,
	renderMatch,
}: {
	matches: readonly BuiltMatch<E>[];
	sets: boolean;
	keyOf: (built: BuiltMatch<E>) => React.Key;
	justFormedKeys: ReadonlySet<React.Key>;
	renderMatch: (built: BuiltMatch<E>, justFormed: boolean) => React.ReactNode;
}) {
	const setNumbers = sets ? assignMatchSets(matches.map((b) => b.match)) : [];
	const showSetDividers = (setNumbers.at(-1) ?? 1) > 1;

	// newest match on top; the builder keeps ascending time order
	return [...matches].reverse().map((built, reverseIndex) => {
		const index = matches.length - 1 - reverseIndex;
		const key = keyOf(built);
		return (
			<Fragment key={key}>
				{showSetDividers && setNumbers[index + 1] !== setNumbers[index] ? (
					<SetDivider number={setNumbers[index]!} />
				) : null}
				{renderMatch(built, justFormedKeys.has(key))}
			</Fragment>
		);
	});
}

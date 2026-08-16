/**
 * Flattened localized match sets derived from the generated
 * localized-entries.ts: detectors snap OCR output against every language's
 * strings at once and report the sendou.ink id, so ingestion works no
 * matter which language the player runs the game in. Combos (mode+stage,
 * lobby+mode) stay within one language — on-screen text never mixes
 * languages — which keeps the cross product from inventing pairings no UI
 * would show.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../scanner-types";
import {
	LANGUAGE_ENTRIES,
	type LocalizedLobby,
	type LocalizedMode,
	type LocalizedStage,
} from "./localized-entries";
import { matchKey } from "./text";

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const k = keyOf(item);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

const byText = (e: { text: string }) => matchKey(e.text);

export const ALL_LOBBY_ENTRIES: readonly LocalizedLobby[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) => l.lobbies),
	byText,
);

/** Single-line mode names plus the intro splash's two-line wrap variants. */
export const ALL_MODE_ENTRIES: readonly LocalizedMode[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) => [...l.modes, ...l.modeWraps]),
	byText,
);

export const ALL_STAGE_ENTRIES: readonly LocalizedStage[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) => l.stages),
	byText,
);

/** Every language's constant "MODE" intro-splash label. */
export const ALL_MODE_LABELS: readonly string[] = dedupe(
	LANGUAGE_ENTRIES.map((l) => l.modeLabel),
	matchKey,
);

/** Replay-browser panel tags; canonical is "VICTORY" or "DEFEAT". */
export const RESULT_TAG_ENTRIES: readonly {
	text: string;
	canonical: string;
}[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) => [
		{ text: l.victory, canonical: "VICTORY" },
		{ text: l.defeat, canonical: "DEFEAT" },
	]),
	byText,
);

export interface ModeStageCombo {
	text: string;
	mode: ModeShort;
	stageId: StageId;
}

/** The scoreboard header's "<mode> <stage>" line, per language. */
export const MODE_STAGE_COMBOS: readonly ModeStageCombo[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) =>
		l.modes.flatMap((mode) =>
			l.stages.map((stage) => ({
				text: `${mode.text} ${stage.text}`,
				mode: mode.mode,
				stageId: stage.stageId,
			})),
		),
	),
	byText,
);

export interface LobbyModeCombo {
	text: string;
	lobby: ScannerLobby;
	mode: ModeShort;
}

/** The replay-browser header's "<lobby> <mode>" line, per language. */
export const LOBBY_MODE_COMBOS: readonly LobbyModeCombo[] = dedupe(
	LANGUAGE_ENTRIES.flatMap((l) =>
		l.lobbies.flatMap((lobby) =>
			l.modes.map((mode) => ({
				text: `${lobby.text} ${mode.text}`,
				lobby: lobby.lobby,
				mode: mode.mode,
			})),
		),
	),
	byText,
);

/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Generate the localized closed sets from the splat3 repo's language dumps
 * (https://github.com/Leanny/splat3, data/language/<Lang>_full.json), so
 * ingestion works no matter which language the player runs the game in.
 * Detectors OCR whatever is on screen, snap it against every language's
 * entries, and always emit the sendou.ink id (canonical English text
 * exists only inside the snap tables).
 *
 * Sources per language:
 *   CommonMsg/VS/VSRuleName          modes (+ the _2L two-line intro-splash
 *                                    wrap variants, e.g. "Muschel-\nchaos")
 *   CommonMsg/VS/VSStageName         stages (keyed via the USen values)
 *   CommonMsg/MatchMode              lobby tags (XMatch / Private)
 *   LayoutMsg/Lobby_MenuMode_00      the intro splash's "MODE" label
 *   LayoutMsg/Mng_Result_00          replay-browser VICTORY / DEFEAT tags
 *   LayoutMsg/VS_Beaten_00 (999)     the death-burst message; the weapon
 *                                    placeholder sits on line 1 or 2
 *                                    depending on language, so this becomes
 *                                    a per-language template
 *   CommonMsg/Weapon/WeaponName_*    weapon names, mapped to the canonical
 *                                    entries via their USen value
 *
 * Usage: pnpm scanner:build-localized-entries [path-to-splat3]
 * Writes app/features/scanner/core/localized-entries.ts
 *    and app/features/scanner/core/detectors/death/localized-messages.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_WEAPON_ENTRIES } from "../../app/features/scanner/core/detectors/death/weapon-names";
import type { ScannerLobby } from "../../app/features/scanner/scanner-types";
import { stageIds } from "../../app/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "../../app/modules/in-game-lists/types";
import gameMisc from "../../locales/en/game-misc.json";

const SPLAT3_DIR =
	process.argv[2] ?? new URL("../../../splat3", import.meta.url).pathname;
const LANG_DIR = join(SPLAT3_DIR, "data", "language");
const OUT_ENTRIES = new URL(
	"../../app/features/scanner/core/localized-entries.ts",
	import.meta.url,
).pathname;
const OUT_MESSAGES = new URL(
	"../../app/features/scanner/core/detectors/death/localized-messages.ts",
	import.meta.url,
).pathname;

const CANONICAL_LANG = "USen";
const misc = gameMisc as Record<string, string>;

/** VSRuleName key -> ModeShort; USen values validate against the en locale. */
const RULE_KEYS: Record<string, ModeShort> = {
	Pnt: "TW",
	Var: "SZ",
	Vlf: "TC",
	Vgl: "RM",
	Vcl: "CB",
};

/** MatchMode key -> lobby code; USen values validate against these names. */
const LOBBY_KEYS: Record<string, ScannerLobby> = {
	XMatch: "X",
	Bankara: "SERIES",
	BankaraOpen: "OPEN",
	Private: "PRIVATE",
};

/** the English lobby tags as the game shows them, for USen validation */
const LOBBY_ENGLISH: Record<ScannerLobby, string> = {
	X: "X Battle",
	SERIES: "Anarchy Battle (Series)",
	OPEN: "Anarchy Battle (Open)",
	PRIVATE: "Private Battle",
};

type LangDump = Record<string, Record<string, string>>;

function loadLang(lang: string): LangDump {
	return JSON.parse(
		readFileSync(join(LANG_DIR, `${lang}_full.json`), "utf8"),
	) as LangDump;
}

/** Drop [size=...]/[color=...]-style markup and collapse whitespace. */
function clean(s: string): string {
	return s
		.replace(/\[[^\]]*\]/g, "")
		.replace(/[ \t]+/g, " ")
		.trim();
}

/** The case/space/diacritic-insensitive key entries are deduped on (mirrors text.ts). */
function foldKey(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, "");
}

/** sendou.ink locales use the ASCII apostrophe; the game dumps use ’. */
function normalizeApostrophes(s: string): string {
	return s.replace(/[’‘]/g, "'");
}

const languages = [
	...new Set(
		readdirSync(LANG_DIR)
			.filter((f) => f.endsWith("_full.json"))
			.map((f) => f.replace("_full.json", "")),
	),
].sort();
if (!languages.includes(CANONICAL_LANG)) {
	throw new Error(
		`canonical language ${CANONICAL_LANG} not found in ${LANG_DIR}`,
	);
}

const dumps = new Map<string, LangDump>(languages.map((l) => [l, loadLang(l)]));
const usen = dumps.get(CANONICAL_LANG)!;

// ---- validate the canonical sets against USen ------------------------------

for (const [key, mode] of Object.entries(RULE_KEYS)) {
	const value = clean(usen["CommonMsg/VS/VSRuleName"]![key]!);
	const expected = misc[`MODE_LONG_${mode}`]!;
	if (value !== expected)
		throw new Error(`USen rule ${key} is "${value}", expected "${expected}"`);
}
for (const [key, lobby] of Object.entries(LOBBY_KEYS)) {
	const value = clean(usen["CommonMsg/MatchMode"]![key]!);
	const expected = LOBBY_ENGLISH[lobby as ScannerLobby];
	if (value !== expected)
		throw new Error(`USen lobby ${key} is "${value}", expected "${expected}"`);
}

/** English stage name (per the sendou.ink en locale) -> StageId. */
const stageIdByEnglishName = new Map<string, StageId>(
	stageIds.map((stageId) => [misc[`STAGE_${stageId}`]!, stageId]),
);
/** VSStageName key -> StageId, via the USen values. */
const stageKeys = new Map<string, StageId>();
for (const [key, value] of Object.entries(usen["CommonMsg/VS/VSStageName"]!)) {
	const stageId = stageIdByEnglishName.get(value);
	if (stageId !== undefined) stageKeys.set(key, stageId);
}
for (const [name, stageId] of stageIdByEnglishName) {
	if (![...stageKeys.values()].includes(stageId)) {
		throw new Error(
			`stage "${name}" (id ${stageId}) not found in USen VSStageName`,
		);
	}
}

// ---- per-language closed sets ----------------------------------------------

interface LocalizedLobby {
	text: string;
	lobby: ScannerLobby;
}
interface LocalizedMode {
	text: string;
	mode: ModeShort;
}
interface LocalizedStage {
	text: string;
	stageId: StageId;
}

interface LanguageEntries {
	lang: string;
	modeLabel: string;
	victory: string;
	defeat: string;
	lobbies: LocalizedLobby[];
	modes: LocalizedMode[];
	modeWraps: LocalizedMode[];
	stages: LocalizedStage[];
}

const languageEntries: LanguageEntries[] = [];
for (const lang of languages) {
	const d = dumps.get(lang)!;
	const rules = d["CommonMsg/VS/VSRuleName"]!;
	const modes: LocalizedMode[] = [];
	const modeWraps: LocalizedMode[] = [];
	for (const [key, mode] of Object.entries(RULE_KEYS)) {
		modes.push({ text: clean(rules[key]!), mode });
		// the intro splash renders the _2L wrap variant, hyphens included
		const wrap = clean(rules[`${key}_2L`]!.replace(/\n/g, " "));
		if (foldKey(wrap) !== foldKey(rules[key]!))
			modeWraps.push({ text: wrap, mode });
	}
	languageEntries.push({
		lang,
		modeLabel: clean(d["LayoutMsg/Lobby_MenuMode_00"]!.T_Rule_00!),
		victory: clean(d["LayoutMsg/Mng_Result_00"]!.T_Win_00!),
		defeat: clean(d["LayoutMsg/Mng_Result_00"]!.T_Lose_00!),
		lobbies: Object.entries(LOBBY_KEYS).map(([key, lobby]) => ({
			text: clean(d["CommonMsg/MatchMode"]![key]!),
			lobby,
		})),
		modes,
		modeWraps,
		stages: [...stageKeys.entries()].map(([key, stageId]) => ({
			text: clean(d["CommonMsg/VS/VSStageName"]![key]!),
			stageId,
		})),
	});
}

// A localized string that means one thing in language A and another in
// language B would snap ambiguously in the flattened unions — reject.
for (const category of ["lobbies", "modes", "modeWraps", "stages"] as const) {
	const seen = new Map<string, string | number>();
	for (const entries of languageEntries) {
		for (const entry of entries[category]) {
			const value =
				"lobby" in entry
					? entry.lobby
					: "mode" in entry
						? entry.mode
						: entry.stageId;
			const k = foldKey(entry.text);
			const prior = seen.get(k);
			if (prior !== undefined && prior !== value) {
				throw new Error(
					`${category}: "${entry.text}" maps to both "${prior}" and "${value}" across languages`,
				);
			}
			seen.set(k, value);
		}
	}
}

// ---- death message templates -----------------------------------------------

const PLACEHOLDER = /\[group=[^\]]*\]/;
/** stands in for the weapon placeholder while splitting the message */
const SENTINEL = "\u0000";

interface DeathTemplate {
	langs: string[];
	weaponLine: 1 | 2;
	constText: string;
	weaponPre: string;
	weaponPost: string;
}

const templates: DeathTemplate[] = [];
for (const lang of languages) {
	const raw = dumps.get(lang)!["LayoutMsg/VS_Beaten_00"]!["999"]!;
	const lines = raw
		.split("\n")
		.map((l) => clean(l.replace(PLACEHOLDER, SENTINEL)));
	if (lines.length !== 2)
		throw new Error(`${lang}: death message is not two lines: ${raw}`);
	const weaponIndex = lines.findIndex((l) => l.includes(SENTINEL));
	if (weaponIndex < 0)
		throw new Error(`${lang}: no weapon placeholder: ${raw}`);
	const weaponLine = (weaponIndex + 1) as 1 | 2;
	const [pre, post] = lines[weaponLine - 1]!.split(SENTINEL) as [
		string,
		string,
	];
	const constText = lines[weaponLine % 2]!;
	const existing = templates.find(
		(t) =>
			t.weaponLine === weaponLine &&
			t.constText === constText &&
			t.weaponPre === pre &&
			t.weaponPost === post,
	);
	if (existing) existing.langs.push(lang);
	else
		templates.push({
			langs: [lang],
			weaponLine,
			constText,
			weaponPre: pre,
			weaponPost: post,
		});
}

// ---- localized weapon names --------------------------------------------------

const WEAPON_MSGS = [
	"CommonMsg/Weapon/WeaponName_Main",
	"CommonMsg/Weapon/WeaponName_Sub",
	"CommonMsg/Weapon/WeaponName_Special",
];

const canonicalWeaponNames = new Set(ALL_WEAPON_ENTRIES.map((e) => e.name));
/** codename -> canonical entry name, via the USen value. */
const weaponCodenames = new Map<string, string>();
for (const msg of WEAPON_MSGS) {
	for (const [codename, value] of Object.entries(usen[msg]!)) {
		const name = normalizeApostrophes(value);
		if (canonicalWeaponNames.has(name))
			weaponCodenames.set(`${msg} ${codename}`, name);
	}
}
const unmapped = [...canonicalWeaponNames].filter(
	(n) => ![...weaponCodenames.values()].includes(n),
);
if (unmapped.length > 0) {
	console.warn(
		`WARNING: ${unmapped.length} weapon entries have no splat3 codename: ${unmapped.join(", ")}`,
	);
}

/** lang -> localized names that differ from the canonical English name. */
const localizedWeaponNames: Record<string, { text: string; name: string }[]> =
	{};
for (const lang of languages) {
	const d = dumps.get(lang)!;
	const seen = new Set<string>();
	const entries: { text: string; name: string }[] = [];
	for (const [key, name] of weaponCodenames) {
		const [msg, codename] = key.split(" ") as [string, string];
		const text = clean(d[msg]![codename] ?? "");
		if (!text || text === "-") continue;
		const k = foldKey(text);
		if (seen.has(k) || k === foldKey(name)) continue;
		seen.add(k);
		entries.push({ text, name });
	}
	if (entries.length > 0) localizedWeaponNames[lang] = entries;
}

// ---- emit --------------------------------------------------------------------

const banner = (extra: string) =>
	`/**
 * GENERATED by scripts/scanner/build-localized-entries.ts from the splat3 repo's
 * language dumps — do not edit by hand; regenerate when the game adds
 * content. ${extra}
 */`;

writeFileSync(
	OUT_ENTRIES,
	`${banner(
		`Localized versus-UI strings for every game language, each
 * mapped to the sendou.ink id it means (core/localized.ts derives the
 * flattened match sets detectors snap OCR output against).`,
	)}
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../scanner-types";

export interface LocalizedLobby {
  text: string;
  lobby: ScannerLobby;
}

export interface LocalizedMode {
  text: string;
  mode: ModeShort;
}

export interface LocalizedStage {
  text: string;
  stageId: StageId;
}

export interface LanguageEntries {
  lang: string;
  /** the intro splash's constant "MODE" label */
  modeLabel: string;
  /** replay-browser winner/loser panel tags */
  victory: string;
  defeat: string;
  lobbies: LocalizedLobby[];
  modes: LocalizedMode[];
  /** two-line intro-splash wrap variants ("Muschel-\\nchaos"), space-joined */
  modeWraps: LocalizedMode[];
  stages: LocalizedStage[];
}

export const LANGUAGE_ENTRIES: readonly LanguageEntries[] = ${JSON.stringify(
		languageEntries,
		null,
		2,
	)};
`,
);

writeFileSync(
	OUT_MESSAGES,
	`${banner(
		`Per-language death-burst message templates and localized
 * weapon names: the "Splatted by\\n<weapon>!" burst puts the weapon on line
 * 1 or 2 depending on language, with language-specific text around it.`,
	)}

export interface DeathMessageTemplate {
  /** languages sharing this exact template */
  langs: readonly string[];
  /** which burst line carries the weapon name */
  weaponLine: 1 | 2;
  /** the constant text on the other line (parse-time confirmation) */
  constText: string;
  /** constant text around the weapon name on its own line */
  weaponPre: string;
  weaponPost: string;
}

export const DEATH_MESSAGE_TEMPLATES: readonly DeathMessageTemplate[] = ${JSON.stringify(
		templates,
		null,
		2,
	)};

export interface LocalizedWeaponName {
  text: string;
  /** canonical English entry name (weapon-names.ts) */
  name: string;
}

/**
 * Per-language weapon names that differ from the canonical English name
 * (identical ones are omitted; match against the canonical set too).
 */
export const LOCALIZED_WEAPON_NAMES: Readonly<
  Record<string, readonly LocalizedWeaponName[]>
> = ${JSON.stringify(localizedWeaponNames, null, 2)};
`,
);

console.info(
	`localized-entries: ${languages.length} languages, ` +
		`${languageEntries.reduce((n, l) => n + l.stages.length, 0)} stage strings`,
);
console.info(
	`localized-messages: ${templates.length} death templates, ` +
		`${Object.values(localizedWeaponNames).reduce((n, e) => n + e.length, 0)} localized weapon names`,
);

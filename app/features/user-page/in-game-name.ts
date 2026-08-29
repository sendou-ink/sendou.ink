import type { FormsTranslationKey } from "~/form/types";

export const IN_GAME_NAME = {
	NAME_MAX_LENGTH: 10,
	DISCRIMINATOR_MIN_LENGTH: 4,
	DISCRIMINATOR_MAX_LENGTH: 5,
};

export const IN_GAME_NAME_MAX_LENGTH =
	IN_GAME_NAME.NAME_MAX_LENGTH + 1 + IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH;

/**
 * @see {@link https://github.com/kjhf/NintendoSwitchKeyboard}
 */
export const IN_GAME_NAME_CHARACTER_CATEGORIES = [
	{
		id: "symbols",
		label: "inGameName.categories.symbols",
		characters: [
			..."¿¡′‘’‚‛•…″“”„«»←→↑↓⇒⇔˜ˊˋ¢€£¥¤𝑓×÷±∞√¬∀⊂⊃∴∵⁀∂№°¹²³¼½¾♪♭♀♂○⚪⚫◎◻◼◇◆△▲▽▼☆★©®™§¶†⍑※",
		],
	},
	{
		id: "accented",
		label: "inGameName.categories.accented",
		characters: [
			..."àáâãäåæāăąçćċčðďǆǳèéêëēęěğġģħìíîïīįıĳķĺļľłÀÁÂÃÄÅÆĀĂĄÇĆĊČÐĎǅǲÈÉÊËĒĘĚĞĠĢĦÌÍÎÏĪĮİĲĶĹĻĽŁñńņňòóôõöøœőŕřšßśşþťţùúûüūůűųýÿźżžÑŃŅŇÒÓÔÕÖØŒŐŔŘŠẞŚŞÞŤŢÙÚÛÜŪŮŰŲÝŸŹŻŽ",
		],
	},
	{
		id: "greek",
		label: "inGameName.categories.greek",
		characters: [..."αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"],
	},
	{
		id: "cyrillic",
		label: "inGameName.categories.cyrillic",
		characters: range(0x0410, 0x044f),
	},
	{
		id: "hiragana",
		label: "inGameName.categories.hiragana",
		characters: [...range(0x3041, 0x3096), ..."ゝゞ"],
	},
	{
		id: "katakana",
		label: "inGameName.categories.katakana",
		characters: [...range(0x30a1, 0x30fa), ..."ヽヾ"],
	},
	{
		id: "cjk-symbols",
		label: "inGameName.categories.cjkSymbols",
		characters: [..."、。「」『』【】〈〉《》〔〕〜・ー々〆〇〃"],
	},
] as const satisfies ReadonlyArray<{
	id: string;
	label: FormsTranslationKey;
	characters: ReadonlyArray<string>;
}>;

const PICKER_CHARACTERS = IN_GAME_NAME_CHARACTER_CATEGORIES.flatMap(
	(category) => category.characters,
);

const ASCII_NOT_VALID = new Set(["%", "@", "\\"]);
const ASCII_CHARACTERS = range(0x20, 0x7e).filter(
	(character) => !ASCII_NOT_VALID.has(character),
);

const ALLOWED_CHARACTERS = new Set<string>([
	...ASCII_CHARACTERS,
	...PICKER_CHARACTERS,
]);

/**
 * Letters of every script a Nintendo Switch keyboard can produce. Notably this
 * includes kanji/hanzi and hangul, which are too numerous to enumerate in the
 * character picker but are perfectly valid to paste in.
 */
const ALLOWED_SCRIPTS_REGEXP =
	/^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]$/u;

/** Punctuation & symbol code point ranges not covered by any of the scripts above. */
const ALLOWED_CODE_POINT_RANGES = [
	[0x3000, 0x303f], // CJK symbols and punctuation
	[0x3099, 0x309c], // Kana voiced sound marks
	[0x30fb, 0x30fc], // Katakana middle dot & prolonged sound mark
	[0xff01, 0xff60], // Fullwidth forms
	[0xffe0, 0xffe6], // Fullwidth signs
] as const;

const IN_GAME_NAME_REGEXP = new RegExp(
	`^(.+)#([0-9a-z]{${IN_GAME_NAME.DISCRIMINATOR_MIN_LENGTH},${IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH}})$`,
	"u",
);

/** Length of a string counted in code points (so astral characters count as one). */
export function inGameNameLength(value: string): number {
	return [...value].length;
}

/** Normalizes the in-game name and drops every character the game does not allow. */
export function sanitizeInGameName(value: string): string {
	return [...normalizeInGameName(value)].filter(characterIsAllowed).join("");
}

/** Unicode normalization applied to in-game names before they are validated or stored. */
export function normalizeInGameName(value: string): string {
	return value.normalize("NFC");
}

export function inGameNameIsValid(value: string): boolean {
	const match = IN_GAME_NAME_REGEXP.exec(normalizeInGameName(value));
	if (!match) return false;

	const nameCharacters = [...match[1]];
	if (
		nameCharacters.length < 1 ||
		nameCharacters.length > IN_GAME_NAME.NAME_MAX_LENGTH
	) {
		return false;
	}

	return nameCharacters.every(characterIsAllowed);
}

function characterIsAllowed(character: string): boolean {
	if (ALLOWED_CHARACTERS.has(character)) return true;
	if (ALLOWED_SCRIPTS_REGEXP.test(character)) return true;

	const codePoint = character.codePointAt(0)!;
	return ALLOWED_CODE_POINT_RANGES.some(
		([from, to]) => codePoint >= from && codePoint <= to,
	);
}

function range(from: number, to: number): string[] {
	const characters: string[] = [];
	for (let codePoint = from; codePoint <= to; codePoint++) {
		characters.push(String.fromCodePoint(codePoint));
	}
	return characters;
}

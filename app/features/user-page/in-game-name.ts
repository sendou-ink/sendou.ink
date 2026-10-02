import type { FormsTranslationKey } from "~/form/types";

export const IN_GAME_NAME = {
	NAME_MAX_LENGTH: 10,
	DISCRIMINATOR_MIN_LENGTH: 4,
	DISCRIMINATOR_MAX_LENGTH: 5,
};

export const IN_GAME_NAME_MAX_LENGTH =
	IN_GAME_NAME.NAME_MAX_LENGTH + 1 + IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH;

/** @see {@link https://github.com/kjhf/NintendoSwitchKeyboard} */
export const IN_GAME_NAME_CHARACTER_CATEGORIES = [
	{
		id: "symbols",
		label: "inGameName.categories.symbols",
		characters: [
			..."¿¡′‘’…”‐―«»←→↑↓⇒⇔˜´¨¦¢€£¥¤ƒ×÷±∞√¬∀⊂⊃∴∵⌒∂№°¹²³¼½¾♪♭♀♂○●◎□■◇◆△▽☆★©®™§¶†※",
		],
	},
	{
		id: "accented",
		label: "inGameName.categories.accented",
		characters: [
			..."àáâãäåæāăçćċčĉðďǆǳèéêëēĕğġģħìíîïīįĳķĺļľłÀÁÂÃÄÅÆĀĂÇĆĊČĈÐĎǄǱÈÉÊËĒĔĞĠĢĦÌÍÎÏĪĮİĲĶĹĻĽŁñńņňòóôõöøœőŕřšßśşþťțùúûüūůűųýÿźżžÑŃŅŇÒÓÔÕÖØŒŐŔŘŠŚŞÞŤȚÙÚÛÜŪŮŰŲÝŸŹŻŽ",
		],
	},
	{
		id: "greek",
		label: "inGameName.categories.greek",
		characters: [..."αβγδεζηθικλμνξοπρσςτυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"],
	},
	{
		id: "cyrillic",
		label: "inGameName.categories.cyrillic",
		characters: range(0x0410, 0x044f),
	},
	{
		id: "hiragana",
		label: "inGameName.categories.hiragana",
		characters: [...range(0x3041, 0x308f), ..."をんゝ"],
	},
	{
		id: "katakana",
		label: "inGameName.categories.katakana",
		characters: [...range(0x30a1, 0x30ef), ..."ヲンヴヵヶ"],
	},
	{
		id: "cjk-symbols",
		label: "inGameName.categories.cjkSymbols",
		characters: [..."、。「」【】・ー～々〆〒仝"],
	},
] as const satisfies ReadonlyArray<{
	id: string;
	label: FormsTranslationKey;
	characters: ReadonlyArray<string>;
}>;

const PICKER_CHARACTERS = IN_GAME_NAME_CHARACTER_CATEGORIES.flatMap(
	(category) => category.characters,
);

const ASCII_NOT_VALID = new Set(["'", "%", "@", "\\"]);
const ASCII_CHARACTERS = range(0x20, 0x7e).filter(
	(character) => !ASCII_NOT_VALID.has(character),
);

/** Japanese keyboard symbols, left out of the picker as they look like their ASCII counterparts. */
const FULLWIDTH_SYMBOLS = [
	..."！＃＄＆（）＊＋，－．／：；＜＝＞？［］＾＿｛｜｝￥",
];

const ALLOWED_CHARACTERS = new Set<string>([
	...ASCII_CHARACTERS,
	...PICKER_CHARACTERS,
	...FULLWIDTH_SYMBOLS,
]);

/** Kanji/hanzi and hangul, too numerous for the picker. */
const IDEOGRAPH_OR_HANGUL_REGEXP =
	/^[\p{Unified_Ideograph}\p{Script=Hangul}]$/u;

/** Lookalikes mapped to the in-game character. Anything else falls back to its compatibility or accentless form. */
const CHARACTER_REPLACEMENTS = new Map([
	["'", "’"],
	["\t", " "],
	["⏜", "⌒"],
	["⁀", "⌒"],
	["⌢", "⌒"],
	["◠", "⌒"],
	["𝑓", "ƒ"],
	["◼", "■"],
	["▪", "■"],
	["⬛", "■"],
	["◻", "□"],
	["☐", "□"],
	["⬜", "□"],
	["▢", "□"],
	["⚪", "○"],
	["◯", "○"],
	["⚫", "●"],
	["⬤", "●"],
	["⏺", "●"],
	["•", "●"],
	["⦾", "◎"],
	["⊚", "◎"],
	["⭗", "◎"],
	["⦿", "◎"],
	["◉", "◎"],
	["▲", "△"],
	["▵", "△"],
	["🔺", "△"],
	["▼", "▽"],
	["∇", "▽"],
	["🔻", "▽"],
	["▿", "▽"],
	["♦", "◆"],
	["♢", "◇"],
	["◊", "◇"],
	["⬦", "◇"],
	["⭐", "★"],
	["⭑", "★"],
	["🌟", "★"],
	["✫", "★"],
	["✬", "★"],
	["✭", "★"],
	["✯", "★"],
	["✩", "☆"],
	["✰", "☆"],
	["✝", "†"],
	["✞", "†"],
	["🎵", "♪"],
	["🎶", "♪"],
	["♫", "♪"],
	["♩", "♪"],
	["⨯", "×"],
	["✖", "×"],
	["✕", "×"],
	["✘", "×"],
	["⟹", "⇒"],
	["⇛", "⇒"],
	["⬆", "↑"],
	["⬇", "↓"],
	["➡", "→"],
	["⟶", "→"],
	["≪", "«"],
	["≫", "»"],
	["《", "«"],
	["》", "»"],
	["『", "「"],
	["』", "」"],
	["〜", "～"],
	["〃", "”"],
	["⍑", "〒"],
	["·", "・"],
	["‧", "・"],
	["∙", "・"],
	["⋅", "・"],
	["ˊ", "´"],
	["ˋ", "`"],
	["˚", "°"],
	["º", "°"],
	["∘", "°"],
	["“", "”"],
	["„", "”"],
	["‛", "‘"],
	["‚", ","],
	["″", '"'],
	["–", "‐"],
	["—", "―"],
	["−", "-"],
	["∼", "~"],
	["Ţ", "Ț"],
	["ţ", "ț"],
	["Ș", "Ş"],
	["ș", "ş"],
	["Đ", "Ð"],
	["ı", "i"],
	["ẞ", "ß"],
	["ї", "ï"],
	["І", "I"],
	["і", "i"],
	["ѕ", "s"],
	["∅", "Ø"],
	["∆", "Δ"],
	["∑", "Σ"],
	["Ʌ", "Λ"],
	["Ө", "Θ"],
	["Ɵ", "Θ"],
	["ɵ", "θ"],
	["⍺", "α"],
	["ɑ", "α"],
	["ɛ", "ε"],
	["⍳", "ι"],
	["ɩ", "ι"],
	["ƞ", "η"],
	["ᴋ", "к"],
	["ᴍ", "м"],
	["ᴛ", "т"],
	["ᴠ", "v"],
	["ʙ", "в"],
	["ᴄ", "c"],
	["ʜ", "н"],
	["ᴏ", "o"],
	["ᴎ", "и"],
	["ᴙ", "я"],
	["ɸ", "φ"],
]);

const IN_GAME_NAME_REGEXP = new RegExp(
	`^(.+)#([0-9a-z]{${IN_GAME_NAME.DISCRIMINATOR_MIN_LENGTH},${IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH}})$`,
	"u",
);

/** Length in code points, so astral characters count as one. */
export function inGameNameLength(value: string): number {
	return [...value].length;
}

/** Normalizes, swaps lookalikes for the in-game character and drops every character the game does not allow. */
export function sanitizeInGameName(value: string): string {
	return [...normalizeInGameName(value)].map(toAllowedCharacters).join("");
}

/** Unicode normalization applied before validating or storing. */
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
	return (
		ALLOWED_CHARACTERS.has(character) ||
		IDEOGRAPH_OR_HANGUL_REGEXP.test(character)
	);
}

function toAllowedCharacters(character: string): string {
	if (characterIsAllowed(character)) return character;

	const replacement = CHARACTER_REPLACEMENTS.get(character);
	if (replacement) return replacement;

	const compatibilityForm = [...character.normalize("NFKC")]
		.map((part) => CHARACTER_REPLACEMENTS.get(part) ?? part)
		.join("");
	if ([...compatibilityForm].every(characterIsAllowed)) {
		return compatibilityForm;
	}

	return withoutDiacritics(character) ?? "";
}

function withoutDiacritics(character: string): string | null {
	const decomposed = [...character.normalize("NFD")];
	while (decomposed.length > 1) {
		decomposed.pop();
		const candidate = decomposed.join("").normalize("NFC");
		if (characterIsAllowed(candidate)) return candidate;
	}

	return null;
}

function range(from: number, to: number): string[] {
	const characters: string[] = [];
	for (let codePoint = from; codePoint <= to; codePoint++) {
		characters.push(String.fromCodePoint(codePoint));
	}
	return characters;
}

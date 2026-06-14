import type { FormsTranslationKey } from "~/form/types";

const IN_GAME_NAME = {
	NAME_MAX_LENGTH: 10,
	DISCRIMINATOR_MIN_LENGTH: 4,
	DISCRIMINATOR_MAX_LENGTH: 5,
};

export const IN_GAME_NAME_MAX_LENGTH =
	IN_GAME_NAME.NAME_MAX_LENGTH + 1 + IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH;

export const IN_GAME_NAME_CHARACTER_CATEGORIES = [
	{
		id: "symbols",
		label: "inGameName.categories.symbols",
		characters: [
			"★",
			"☆",
			"♪",
			"♫",
			"♭",
			"♯",
			"♥",
			"♡",
			"♦",
			"♣",
			"♠",
			"●",
			"○",
			"◎",
			"◆",
			"◇",
			"■",
			"□",
			"▲",
			"△",
			"▼",
			"▽",
			"→",
			"←",
			"↑",
			"↓",
			"※",
			"〒",
			"♂",
			"♀",
			"℃",
			"¥",
			"£",
			"¢",
			"°",
			"…",
		],
	},
	{
		id: "accented",
		label: "inGameName.categories.accented",
		characters: [
			..."ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿŒœŠšŽžß",
		],
	},
	{
		id: "greek",
		label: "inGameName.categories.greek",
		characters: range(0x0391, 0x03a9).concat(range(0x03b1, 0x03c9)),
	},
	{
		id: "cyrillic",
		label: "inGameName.categories.cyrillic",
		characters: range(0x0410, 0x044f),
	},
	{
		id: "hiragana",
		label: "inGameName.categories.hiragana",
		characters: range(0x3041, 0x3096),
	},
	{
		id: "katakana",
		label: "inGameName.categories.katakana",
		characters: range(0x30a1, 0x30fa),
	},
] as const satisfies ReadonlyArray<{
	id: string;
	label: FormsTranslationKey;
	characters: ReadonlyArray<string>;
}>;

const SPECIAL_CHARACTERS = IN_GAME_NAME_CHARACTER_CATEGORIES.flatMap(
	(category) => category.characters,
);

const ALLOWED_CHARACTERS = new Set<string>([
	...range(0x20, 0x7e),
	...SPECIAL_CHARACTERS,
]);

const NAME_CHARACTER_CLASS = `[\\x20-\\x7E${SPECIAL_CHARACTERS.join("")}]`;

export const IN_GAME_NAME_REGEXP = new RegExp(
	`^${NAME_CHARACTER_CLASS}{1,${IN_GAME_NAME.NAME_MAX_LENGTH}}#[0-9a-z]{${IN_GAME_NAME.DISCRIMINATOR_MIN_LENGTH},${IN_GAME_NAME.DISCRIMINATOR_MAX_LENGTH}}$`,
	"u",
);

export function inGameNameLength(value: string): number {
	return [...value].length;
}

export function sanitizeInGameName(value: string): string {
	return [...value]
		.filter((character) => ALLOWED_CHARACTERS.has(character))
		.join("")
		.normalize("NFC");
}

export function inGameNameIsValid(value: string): boolean {
	return IN_GAME_NAME_REGEXP.test(value);
}

function range(from: number, to: number): string[] {
	const characters: string[] = [];
	for (let codePoint = from; codePoint <= to; codePoint++) {
		characters.push(String.fromCodePoint(codePoint));
	}
	return characters;
}

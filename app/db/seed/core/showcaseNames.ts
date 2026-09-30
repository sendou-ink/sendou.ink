import { ar, base, en, ja, ko, ru } from "@faker-js/faker";
import { USER } from "~/features/user-page/user-page-constants";
import { createSeededFaker, faker } from "./faker";
import * as SplatoonFaker from "./SplatoonFaker";

const fakerJa = createSeededFaker([ja, en, base]);
const fakerKo = createSeededFaker([ko, en, base]);
const fakerRu = createSeededFaker([ru, en, base]);
const fakerAr = createSeededFaker([ar, en, base]);

const LOCALIZED_FAKERS = [fakerJa, fakerKo, fakerRu, fakerAr];

/** Custom names that stress the UI: length extremes, non-Latin scripts, emoji. */
export const CUSTOM_NAMES = [
	"S",
	"Maximum length custom name".padEnd(USER.CUSTOM_NAME_MAX_LENGTH, "!"),
	"イカ墨侍・銀河",
	"오징어대장",
	"Кальмаротрон3000",
	"حبار المحيط",
	"Squidちゃん★",
	"🦑✨ Splat Queen ✨🦑",
	"6-Star Player 🌟🌟🌟🌟🌟🌟",
	"xX_sniper_Xx",
];

/** The Switch keyboard allows no kanji or emoji, so a kanji display name pairs with one of these. */
const KANA_NAMES = [
	"スプラちゃん",
	"いかタコどん",
	"カラマリＸ",
	"タコゾネスあ",
	"ハイカラねこ",
];

export function customName(): string {
	return localized().person.firstName();
}

export function kanaInGameName(): string {
	return SplatoonFaker.inGameName(faker.helpers.arrayElement(KANA_NAMES));
}

export function teamName(): string {
	return faker.helpers.arrayElement([
		() => "Δq",
		() => `${fakerJa.person.lastName()}${fakerJa.animal.type()}団`,
		() => `${fakerRu.word.adjective()} ${fakerRu.animal.type()}`,
		() => `${faker.word.adjective()} ${faker.animal.type()} 🦑`,
		() => `${faker.company.name()}`,
		() => `${faker.word.adjective()} ${faker.word.noun()}`,
	])();
}

export function buildTitle(): string {
	return faker.helpers.arrayElement([
		() => "⭐",
		() => `${fakerJa.word.adjective()}ビルド`,
		() => `${faker.word.adjective()} ${faker.word.noun()} 💥`,
		() => faker.lorem.words(3),
	])();
}

export function eventName(): string {
	return faker.helpers.arrayElement([
		() => `${fakerKo.location.city()} 컵`,
		() => `${faker.word.adjective()} ${faker.word.noun()} Cup ✨`,
		() => `${faker.company.name()} Open`,
	])();
}

export function postText(): string {
	return faker.helpers.arrayElement([
		() => fakerJa.lorem.paragraph(),
		() => fakerAr.lorem.paragraph(),
		() => faker.lorem.paragraphs({ min: 1, max: 4 }),
	])();
}

/** A bio at the exact max length, heavy on markdown. */
export function maxLengthBio(): string {
	const blocks = [
		"# Achievements",
		"- **Winner** of [Paddling Pool](https://sendou.ink) `#253`",
		"- *Runner-up* at ~~everything else~~",
		"## Weapons",
		"1. `Splattershot`\n2. **Tentatek** — *the classic*",
		"> The real zones were the friends we made along the way",
		"---",
		fakerJa.lorem.paragraph(),
		faker.lorem.paragraph(),
	];

	let bio = "";
	for (let i = 0; ; i++) {
		const block = blocks[i % blocks.length];
		if (bio.length + block.length + 2 >= USER.BIO_MAX_LENGTH) break;

		bio += `${block}\n\n`;
	}

	return bio.padEnd(USER.BIO_MAX_LENGTH, "!").slice(0, USER.BIO_MAX_LENGTH);
}

function localized() {
	return faker.helpers.arrayElement([faker, ...LOCALIZED_FAKERS]);
}

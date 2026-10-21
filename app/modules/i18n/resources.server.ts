import * as R from "remeda";
import analyzer from "../../../locales/en/analyzer.json";
import art from "../../../locales/en/art.json";
import badges from "../../../locales/en/badges.json";
import builds from "../../../locales/en/builds.json";
import calendar from "../../../locales/en/calendar.json";
import common from "../../../locales/en/common.json";
import contributions from "../../../locales/en/contributions.json";
import faq from "../../../locales/en/faq.json";
import forms from "../../../locales/en/forms.json";
import friends from "../../../locales/en/friends.json";
import front from "../../../locales/en/front.json";
import gameBadges from "../../../locales/en/game-badges.json";
import gameMisc from "../../../locales/en/game-misc.json";
import gear from "../../../locales/en/gear.json";
import lfg from "../../../locales/en/lfg.json";
import lobbies from "../../../locales/en/lobbies.json";
import org from "../../../locales/en/org.json";
import params from "../../../locales/en/params.json";
import q from "../../../locales/en/q.json";
import scheduleEn from "../../../locales/en/schedule.json";
import scrimsEn from "../../../locales/en/scrims.json";
import settings from "../../../locales/en/settings.json";
import team from "../../../locales/en/team.json";
import tierListMaker from "../../../locales/en/tier-list-maker.json";
import tournament from "../../../locales/en/tournament.json";
import trophies from "../../../locales/en/trophies.json";
import user from "../../../locales/en/user.json";
import vods from "../../../locales/en/vods.json";
import weapons from "../../../locales/en/weapons.json";
import welcomeEn from "../../../locales/en/welcome.json";
import {
	DEFAULT_LANGUAGE,
	GAME_NAMESPACES,
	type GameLanguageCode,
	languageChain,
} from "./config";

const english = {
	analyzer,
	art,
	badges,
	builds,
	calendar,
	common,
	contributions,
	faq,
	forms,
	friends,
	front,
	"game-badges": gameBadges,
	"game-misc": gameMisc,
	gear,
	lfg,
	lobbies,
	org,
	params,
	q,
	schedule: scheduleEn,
	scrims: scrimsEn,
	settings,
	team,
	"tier-list-maker": tierListMaker,
	tournament,
	trophies,
	user,
	vods,
	weapons,
	welcome: welcomeEn,
};

export type Namespace = keyof typeof english;

type LanguageResources = Partial<Record<Namespace, Record<string, string>>>;

const otherLanguageFiles = import.meta.glob<Record<string, string>>(
	["../../../locales/*/*.json", "!../../../locales/en/*.json"],
	{ eager: true, import: "default" },
);

/**
 * Translations of every language as they are in the locale files: a language only has the namespaces it has
 * translated something in and a regional variant (e.g. `es-US`) only what differs from its parent language.
 */
export const resources: Record<string, LanguageResources> & {
	en: typeof english;
} = {
	...R.pipe(
		Object.entries(otherLanguageFiles),
		R.map(([filePath, translations]) => {
			const [language, file] = filePath.split("/").slice(-2);
			return { language, namespace: file.replace(".json", ""), translations };
		}),
		R.groupBy(({ language }) => language),
		R.mapValues((files) =>
			Object.fromEntries(
				files.map(({ namespace, translations }) => [namespace, translations]),
			),
		),
	),
	[DEFAULT_LANGUAGE]: english,
};

const gameLanguageResourcesCache = new Map<
	GameLanguageCode,
	Record<string, LanguageResources>
>();

/** {@link resources} with every language's in-game names (e.g. `weapons` namespace) replaced by the game language's */
export function resourcesWithGameLanguage(
	gameLanguage: GameLanguageCode,
): Record<string, LanguageResources> {
	const cached = gameLanguageResourcesCache.get(gameLanguage);
	if (cached) return cached;

	const fallbackOrder = languageChain(gameLanguage).toReversed();
	const gameNamespaces = Object.fromEntries(
		GAME_NAMESPACES.map((namespace) => [
			namespace,
			Object.assign(
				{},
				...fallbackOrder.map((language) => resources[language]?.[namespace]),
			),
		]),
	);

	const result = R.mapValues(resources, (languageResources) => ({
		...languageResources,
		...gameNamespaces,
	}));
	gameLanguageResourcesCache.set(gameLanguage, result);

	return result;
}

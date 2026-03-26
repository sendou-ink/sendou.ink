import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import analyzerEn from "../../../locales/en/analyzer.json";
import artEn from "../../../locales/en/art.json";
import badgesEn from "../../../locales/en/badges.json";
import buildsEn from "../../../locales/en/builds.json";
import calendarEn from "../../../locales/en/calendar.json";
import commonEn from "../../../locales/en/common.json";
import contributionsEn from "../../../locales/en/contributions.json";
import faqEn from "../../../locales/en/faq.json";
import formsEn from "../../../locales/en/forms.json";
import friendsEn from "../../../locales/en/friends.json";
import frontEn from "../../../locales/en/front.json";
import gameBadgesEn from "../../../locales/en/game-badges.json";
import gameMiscEn from "../../../locales/en/game-misc.json";
import gearEn from "../../../locales/en/gear.json";
import lfgEn from "../../../locales/en/lfg.json";
import orgEn from "../../../locales/en/org.json";
import qEn from "../../../locales/en/q.json";
import scrimsEn from "../../../locales/en/scrims.json";
import teamEn from "../../../locales/en/team.json";
import tierListMakerEn from "../../../locales/en/tier-list-maker.json";
import tournamentEn from "../../../locales/en/tournament.json";
import userEn from "../../../locales/en/user.json";
import vodsEn from "../../../locales/en/vods.json";
import weaponsEn from "../../../locales/en/weapons.json";
import { config } from "./config";

// xxx: temporary hack

const i18nInitPromise = i18next.use(initReactI18next).init({
	...config,
	lng: config.fallbackLng,
	resources: {
		en: {
			analyzer: analyzerEn,
			art: artEn,
			badges: badgesEn,
			builds: buildsEn,
			calendar: calendarEn,
			common: commonEn,
			contributions: contributionsEn,
			faq: faqEn,
			forms: formsEn,
			friends: friendsEn,
			front: frontEn,
			"game-badges": gameBadgesEn,
			"game-misc": gameMiscEn,
			gear: gearEn,
			lfg: lfgEn,
			org: orgEn,
			q: qEn,
			scrims: scrimsEn,
			team: teamEn,
			"tier-list-maker": tierListMakerEn,
			tournament: tournamentEn,
			user: userEn,
			vods: vodsEn,
			weapons: weaponsEn,
		},
	},
	showSupportNotice: false,
});

export { i18nInitPromise };

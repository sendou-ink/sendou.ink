import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, type MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { type LanguageCode, languages } from "~/modules/i18n/config";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	GITHUB_CONTRIBUTORS_URL,
	RHODESMAS_FREESOUND_PROFILE_URL,
	SPLATOON_3_INK,
	TRANSLATE_PAGE,
} from "~/utils/urls";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Contributions",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "contributions",
};

const PROGRAMMERS = [
	"hfcRed",
	"DoubleCookies",
	"ElementUser",
	"remmycat",
	"zenpk",
	"KaiserOfNone",
	"ximk",
	"rikipls",
] as const;

const TRANSLATORS: Array<{
	translators: Array<string>;
	language: LanguageCode;
}> = [
	{
		translators: ["NoAim™bUrn", "Alice", "jgiefer"],
		language: "de",
	},
	{
		translators: ["KaiserOfNone", "Mario64iscool2", "Lasky"],
		language: "es-ES",
	},
	{
		translators: ["Hachi Shibaru", "KaiserOfNone", "Mario64iscool2", "Lasky"],
		language: "es-US",
	},
	{
		translators: [
			"Charakiga",
			"marie-maxime",
			"Filuz",
			"julufm",
			"IKEI",
			"mewpower",
			"Babagass",
		],
		language: "fr-EU",
	},
	{
		translators: ["funyaaa", "taqm", "yutarour", "Koreki"],
		language: "ja",
	},
	{
		translators: [
			"たここ",
			"ShanglinMo",
			"gellneko",
			"zenpk",
			"chenyenru",
			"Inkorest",
		],
		language: "zh",
	},
];

export default function ContributionsPage() {
	const { t } = useTranslation(["common", "contributions"]);

	return (
		<Main>
			<p>
				<Trans i18nKey={"contributions:project"} t={t}>
					Sendou.ink is a project by Sendou with help from contributors:
				</Trans>
			</p>
			<ul className="mt-2">
				<li>
					{PROGRAMMERS.join(", ")} -{" "}
					<a href={GITHUB_CONTRIBUTORS_URL} target="_blank" rel="noreferrer">
						{t("contributions:code")}
					</a>
				</li>
				<li>Lean - {t("contributions:lean")}</li>
				<li>BUGSLAP - {t("contributions:bugslap")}</li>
				<li>borzoic - {t("contributions:borzoic")}</li>
				<li>TORIPNG - {t("contributions:toripng")}</li>
				<li>uberu - {t("contributions:uberu")}</li>
				<li>yaga - {t("contributions:yaga")}</li>
				<li>Centritide - {t("contributions:centritide")}</li>
				<li>Antariska, yaga & harryXYZ - {t("contributions:antariska")}</li>
				<li>
					<a href={SPLATOON_3_INK} target="_blank" rel="noreferrer">
						splatoon3.ink
					</a>{" "}
					- {t("contributions:splatoon3ink")}
				</li>
				{TRANSLATORS.map(({ translators, language }) => (
					<li key={language}>
						{translators.map((element, i, arr) => (
							<React.Fragment key={i}>
								{element}
								{i !== arr.length - 1 ? ", " : null}
							</React.Fragment>
						))}{" "}
						- {t("contributions:translation")} (
						{languages.find((lang) => lang.code === language)!.name})
					</li>
				))}
				<li>
					<a
						href={RHODESMAS_FREESOUND_PROFILE_URL}
						target="_blank"
						rel="noreferrer"
					>
						Andy Rhode
					</a>{" "}
					- {t("contributions:sounds")}
				</li>
			</ul>
			<p className="mt-4">
				<Link to={TRANSLATE_PAGE}>
					Want to see sendou.ink in your language? Help translate it!
				</Link>
			</p>
		</Main>
	);
}

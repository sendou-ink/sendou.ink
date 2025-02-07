import type { MetaFunction } from "@remix-run/node";
import * as React from "react";
import { Trans } from "react-i18next";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { languages } from "~/modules/i18n/config";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	GITHUB_CONTRIBUTORS_URL,
	RHODESMAS_FREESOUND_PROFILE_URL,
	SPLATOON_3_INK,
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
	language: (typeof languages)[number]["code"];
}> = [
	{
		translators: ["Frederik"],
		language: "da",
	},
	{
		translators: ["NoAim™bUrn", "Alice", "jgiefer"],
		language: "de",
	},
	{
		translators: ["KaiserOfNone", "Mario64iscool2"],
		language: "es-ES",
	},
	{
		translators: ["Hachi Shibaru", "KaiserOfNone", "Mario64iscool2"],
		language: "es-US",
	},
	{
		translators: ["Charakiga", "marie-maxime", "Filuz"],
		language: "fr-CA",
	},
	{
		translators: ["Charakiga", "marie-maxime", "Filuz"],
		language: "fr-EU",
	},
	{
		translators: ["shachar700"],
		language: "he",
	},
	{
		translators: ["funyaaa", "taqm", "yutarour"],
		language: "ja",
	},
	{
		translators: ["niLPotential"],
		language: "ko",
	},
	{
		translators: ["diamo"],
		language: "pl",
	},
	{
		translators: ["Ant"],
		language: "pt-BR",
	},
	{
		translators: ["Ferrari"],
		language: "nl",
	},
	{
		translators: ["DoubleCookies", "yaga"],
		language: "ru",
	},
	{
		translators: ["たここ", "ShanglinMo", "gellneko", "zenpk", "chenyenru"],
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
				<li>borzoic - {t("contributions:borzoic")}</li>
				<li>uberu - {t("contributions:uberu")}</li>
				<li>yaga - {t("contributions:yaga")}</li>
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
		</Main>
	);
}

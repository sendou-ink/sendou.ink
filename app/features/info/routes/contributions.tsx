import type { MetaFunction } from "@remix-run/node";
import * as React from "react";
import { Trans } from "react-i18next";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { useSetTitle } from "~/hooks/useSetTitle";
import { languages } from "~/modules/i18n/config";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import {
	ANTARISKA_TWITTER,
	BORZOIC_TWITTER,
	GITHUB_CONTRIBUTORS_URL,
	LEAN_TWITTER,
	RHODESMAS_FREESOUND_PROFILE_URL,
	SENDOU_TWITTER_URL,
	SPLATOON_3_INK,
	UBERU_TWITTER,
	YAGA_TWITTER,
} from "~/utils/urls";

// xxx: meta
export const meta: MetaFunction = () => {
	return [{ title: makeTitle("Contributions") }];
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
	translators: Array<string | { name: string; twitter: string }>;
	language: (typeof languages)[number]["code"];
}> = [
	{
		translators: ["Frederik"],
		language: "da",
	},
	{
		translators: [
			{ name: "NoAim™bUrn", twitter: "noaim_brn" },
			{ name: "Alice", twitter: "Aloschus" },
			"jgiefer",
		],
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
		translators: [{ name: "funyaaa", twitter: "funyaaa1" }, "taqm", "yutarour"],
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
		translators: [{ name: "Ant", twitter: "Ant__Spl" }],
		language: "pt-BR",
	},
	{
		translators: [{ name: "Ferrari", twitter: "Blusling" }],
		language: "nl",
	},
	{
		translators: [{ name: "DoubleCookies", twitter: "DblCookies" }, "yaga"],
		language: "ru",
	},
	{
		translators: ["たここ", "ShanglinMo", "gellneko", "zenpk", "chenyenru"],
		language: "zh",
	},
];

export default function ContributionsPage() {
	const { t } = useTranslation(["common", "contributions"]);
	useSetTitle(t("common:pages.contributors"));

	return (
		<Main>
			<p>
				<Trans i18nKey={"contributions:project"} t={t}>
					Sendou.ink is a project by{" "}
					<a href={SENDOU_TWITTER_URL} target="_blank" rel="noreferrer">
						Sendou
					</a>{" "}
					with help from contributors:
				</Trans>
			</p>
			<ul className="mt-2">
				<li>
					{PROGRAMMERS.join(", ")} -{" "}
					<a href={GITHUB_CONTRIBUTORS_URL} target="_blank" rel="noreferrer">
						{t("contributions:code")}
					</a>
				</li>
				<li>
					<a href={LEAN_TWITTER} target="_blank" rel="noreferrer">
						Lean
					</a>{" "}
					- {t("contributions:lean")}
				</li>
				<li>
					<a href={BORZOIC_TWITTER} target="_blank" rel="noreferrer">
						borzoic
					</a>{" "}
					- {t("contributions:borzoic")}
				</li>
				<li>
					<a href={UBERU_TWITTER} target="_blank" rel="noreferrer">
						uberu
					</a>{" "}
					- {t("contributions:uberu")}
				</li>
				<li>
					<a href={YAGA_TWITTER} target="_blank" rel="noreferrer">
						yaga
					</a>{" "}
					- {t("contributions:yaga")}
				</li>
				<li>
					<a href={ANTARISKA_TWITTER} target="_blank" rel="noreferrer">
						Antariska, yaga & harryXYZ
					</a>{" "}
					- {t("contributions:antariska")}
				</li>
				<li>
					<a href={SPLATOON_3_INK} target="_blank" rel="noreferrer">
						splatoon3.ink
					</a>{" "}
					- {t("contributions:splatoon3ink")}
				</li>
				{TRANSLATORS.map(({ translators, language }) => (
					<li key={language}>
						{translators
							.map((t) =>
								typeof t === "string" ? (
									t
								) : (
									<a
										key={t.name}
										href={`https://twitter.com/${t.twitter}`}
										rel="noreferrer"
										target="_blank"
									>
										{t.name}
									</a>
								),
							)
							.map((element, i, arr) => (
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

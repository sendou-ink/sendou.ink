import { Link, type MetaFunction, useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { languages } from "~/modules/i18n/config";
import { metaTags } from "~/utils/remix";
import { translatePage } from "~/utils/urls";
import { TranslationProgressBar } from "../components/TranslationProgressBar";
import { loader } from "../loaders/translate.server";
import styles from "./translate.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Translate",
		description:
			"Help translate sendou.ink, the competitive Splatoon hub, into your language.",
		location: args.location,
	});
};

export default function TranslatePage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<div className="stack sm">
				<h1 className="text-xl">Translate sendou.ink</h1>
				<p>
					Help bring sendou.ink to your language! Anyone can translate, pick a
					language to see the texts that are waiting for a translation.
				</p>
				<p className="text-sm text-lighter">
					Your translations are saved as drafts in this browser and you can
					preview them on the site. When you are done, download the translation
					files and upload them to GitHub or send them to Sendou to make them
					live for everyone. To continue in another browser, import the
					downloaded files there.
				</p>
			</div>
			<ul className={styles.languages}>
				{data.languages.map((progress) => (
					<li key={progress.language}>
						<Link
							to={translatePage(progress.language)}
							className={styles.language}
							data-testid={`translate-language-${progress.language}`}
						>
							<span className={styles.languageName}>
								{
									languages.find((lang) => lang.code === progress.language)
										?.name
								}
								<span className="text-xs text-lighter">
									{progress.language}
								</span>
							</span>
							<TranslationProgressBar {...progress} />
						</Link>
					</li>
				))}
			</ul>
		</Main>
	);
}

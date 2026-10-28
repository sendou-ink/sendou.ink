import { ArrowRight, Repeat, Trophy, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import styles from "./CircuitQuickFacts.module.css";

const FACTS = [
	{ key: "major", Icon: Trophy },
	{ key: "bracket", Icon: Users },
	{ key: "modes", Icon: Repeat },
] as const;

export function CircuitQuickFacts() {
	const { t } = useTranslation(["circuit"]);

	return (
		<div className={styles.container}>
			<section className={styles.quickFacts}>
				<div className={styles.intro}>
					<h2 className={styles.title}>{t("circuit:quickFacts.title")}</h2>
					<p className={styles.subtitle}>{t("circuit:quickFacts.intro")}</p>
					<SendouButton
						variant="ghost"
						size="small"
						className={styles.readMore}
					>
						{t("circuit:quickFacts.readMore")}
						<ArrowRight size={16} className="ml-1" aria-hidden />
					</SendouButton>
				</div>
				<ul className={styles.facts}>
					{FACTS.map(({ key, Icon }) => (
						<li key={key} className={styles.fact}>
							<div className={styles.icon}>
								<Icon size={20} aria-hidden />
							</div>
							<div className="stack xxs">
								<h3 className={styles.header}>
									{t(`circuit:quickFacts.${key}.header`)}
								</h3>
								<p className={styles.subtitle}>
									{t(`circuit:quickFacts.${key}.subtitle`)}
								</p>
							</div>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

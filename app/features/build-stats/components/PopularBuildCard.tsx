import { Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { LinkButton } from "~/components/elements/Button";
import { Image, ModeImage } from "~/components/Image";
import { analyzerPage } from "~/features/build-analyzer/analyzer-urls";
import { isStackableAbility } from "~/features/build-analyzer/core/ability-points";
import { MAX_BUILD_FILTERS } from "~/features/builds/builds-constants";
import { buildsSearchParams } from "~/features/builds/builds-search-params";
import type { AbilityFilter } from "~/features/builds/builds-types";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { navIconUrl, weaponBuildPage } from "~/utils/urls";
import styles from "./PopularBuildCard.module.css";

interface PopularBuild {
	rank: number;
	playersCount: number;
	playersPercentage: number;
	abilities: BuildAbilitiesTuple;
	modes: ModeShort[];
	abilityPoints: Array<{ ability: AbilityType; abilityPoints: number }>;
}

/** An ability combination many players run: how many, its most common gear layout and links to try it out or find builds like it. */
export function PopularBuildCard({
	build,
	mostPopularPlayersCount,
	weaponId,
	slug,
}: {
	build: PopularBuild;
	/** The bar showing the players count is relative to this. */
	mostPopularPlayersCount: number;
	weaponId: MainWeaponId;
	slug: string;
}) {
	const { t } = useTranslation(["builds", "common"]);
	const playersLabel = t("builds:popular.players", {
		count: build.playersCount,
	});

	return (
		<li className={styles.card}>
			<div className={styles.header}>
				<span className={styles.rank} data-top={build.rank <= 3}>
					#{build.rank}
				</span>
				<div className={styles.modes}>
					{build.modes.map((mode) => (
						<ModeImage key={mode} mode={mode} size={20} />
					))}
				</div>
			</div>
			<div className="stack xs">
				<div className="stack horizontal sm justify-between text-xs">
					<span className="stack horizontal xs items-center font-semi-bold">
						<Users size={14} className="text-lighter" />
						{playersLabel}
					</span>
					<span className="text-lighter">{build.playersPercentage}%</span>
				</div>
				<progress
					className={styles.playersBar}
					value={build.playersCount}
					max={mostPopularPlayersCount}
					aria-label={playersLabel}
				/>
			</div>
			<div className={styles.abilities}>
				{build.abilities.flatMap((gearAbilities, gearIndex) =>
					gearAbilities.map((ability, i) => (
						<Ability
							key={`${gearIndex}-${i}`}
							ability={ability}
							size={i === 0 ? "MAIN" : "SUB"}
						/>
					)),
				)}
			</div>
			<div className={styles.actions}>
				<LinkButton
					to={analyzerPage({ weaponId, abilities: build.abilities.flat() })}
					shape="circle"
					variant="minimal"
					className={styles.action}
					aria-label={t("common:pages.analyzer")}
				>
					<Image
						size={20}
						alt={t("common:pages.analyzer")}
						path={navIconUrl("analyzer")}
					/>
				</LinkButton>
				<LinkButton
					to={buildsSearchParams.href(weaponBuildPage(slug), {
						abilities: similarBuildFilters(build.abilityPoints),
					})}
					shape="circle"
					variant="minimal"
					className={styles.action}
					icon={<Search />}
					aria-label={t("builds:popular.findSimilar")}
				/>
			</div>
		</li>
	);
}

function similarBuildFilters(
	buildAbilityPoints: PopularBuild["abilityPoints"],
): AbilityFilter[] {
	return buildAbilityPoints
		.slice(0, MAX_BUILD_FILTERS)
		.map(({ ability, abilityPoints }) =>
			isStackableAbility(ability)
				? { type: "AT_LEAST", ability, ap: abilityPoints }
				: { type: "HAS", ability },
		);
}

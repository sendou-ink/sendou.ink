import clsx from "clsx";
import { WeaponPool } from "~/components/match-page/WeaponPool";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./LobbyRolledWeapons.module.css";

/**
 * A side's weapons from the weapon randomizer, names in a popover. The viewer's own team's is highlighted and the
 * opponent's faded, `isOwnTeam` being `null` for a viewer not playing. `narrowLabel` names the side in a narrow
 * container, where it no longer sits next to the side's name.
 */
export function LobbyRolledWeapons({
	weapons,
	isOwnTeam,
	narrowLabel,
}: {
	weapons: MainWeaponId[];
	isOwnTeam: boolean | null;
	narrowLabel?: string;
}) {
	return (
		<div className={styles.root} data-testid="lobby-rolled-weapons">
			{narrowLabel ? (
				<span className={styles.narrowLabel}>{narrowLabel}</span>
			) : null}
			<div
				className={clsx(styles.weapons, {
					[styles.own]: isOwnTeam === true,
					[styles.opponent]: isOwnTeam === false,
				})}
			>
				<WeaponPool weapons={weapons} size={28} />
			</div>
		</div>
	);
}

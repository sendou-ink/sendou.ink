import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { calculatorSearchParams } from "./calculator-search-params";

export const objectDamageCalculatorPage = (weaponId?: MainWeaponId) =>
	typeof weaponId === "number"
		? calculatorSearchParams.href("/object-damage-calculator", {
				weapon: { type: "MAIN", id: weaponId },
			})
		: "/object-damage-calculator";

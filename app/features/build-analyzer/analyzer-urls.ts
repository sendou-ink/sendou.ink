import type {
	Ability,
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { analyzerSearchParams } from "./analyzer-search-params";

export const analyzerPage = (args?: {
	weaponId: MainWeaponId;
	abilities: Ability[];
}) =>
	args
		? analyzerSearchParams.href("/analyzer", {
				weapon: args.weaponId,
				build: [
					args.abilities.slice(0, 4),
					args.abilities.slice(4, 8),
					args.abilities.slice(8, 12),
				] as BuildAbilitiesTupleWithUnknown,
			})
		: "/analyzer";

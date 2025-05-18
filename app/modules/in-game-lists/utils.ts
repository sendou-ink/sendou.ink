import { abilities } from "./abilities";
import type { Ability } from "./types";

export function isAbility(value: string): value is Ability {
	return Boolean(abilities.some((a) => a.name === value));
}

import type { DamageType } from "~/features/build-analyzer";

export const damageTypeTranslationString = ({
	damageType,
}: {
	damageType: DamageType;
}) => `analyzer:damage.${damageType}` as const;

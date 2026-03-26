import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type { SelectOption } from "~/form/types";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import { useHasRole } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LFG_PAGE, navIconUrl, userEditProfilePage } from "~/utils/urls";
import { action } from "../actions/lfg.new.server";
import { LFG, TEAM_POST_TYPES, TIMEZONES } from "../lfg-constants";
import { lfgNewSchema } from "../lfg-schemas";
import { loader } from "../loaders/lfg.new.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["lfg"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lfg"),
		href: LFG_PAGE,
		type: "IMAGE",
	}),
};

const browserTimezone = () => {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (TIMEZONES.includes(tz)) return tz;
	} catch {
		// ignore
	}
	return TIMEZONES[0];
};

export default function LFGNewPostPage() {
	const isPlusServerMember = useHasRole("PLUS_SERVER_MEMBER");
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "lfg"]);
	const user = useUser();
	const availableTypes = useAvailablePostTypes();

	if (availableTypes.length === 0) {
		return (
			<Main halfWidth className="stack items-center">
				<h2 className="text-lg mb-4">{t("lfg:new.noMorePosts")}</h2>
				<LinkButton to={LFG_PAGE} icon={<ChevronLeft />}>
					{t("common:actions.goBack")}
				</LinkButton>
			</Main>
		);
	}

	const typeOptions: SelectOption[] = availableTypes.map((type) => ({
		value: type,
		label: `${t(`lfg:types.${type}`)}${data.team && TEAM_POST_TYPES.includes(type) ? ` (${data.team.name})` : ""}`,
	}));

	const timezoneOptions: SelectOption[] = TIMEZONES.map((tz) => ({
		value: tz,
		label: tz,
	}));

	const plusTierOptions: SelectOption[] = [1, 2, 3]
		.filter((tier) => user?.plusTier && tier >= user.plusTier)
		.map((tier) => ({
			value: String(tier),
			label: `+${tier} ${tier > 1 ? t("lfg:filters.orAbove") : ""}`.trim(),
		}));

	return (
		<Main halfWidth>
			<SendouForm
				schema={lfgNewSchema}
				title={data.postToEdit ? "Editing LFG post" : "New LFG post"}
				defaultValues={{
					postId: data.postToEdit?.id,
					type: data.postToEdit?.type ?? availableTypes[0],
					timezone: data.postToEdit?.timezone ?? browserTimezone(),
					postText: data.postToEdit?.text ?? "",
					plusTierVisibility: data.postToEdit?.plusTierVisibility
						? String(data.postToEdit.plusTierVisibility)
						: null,
					languages: (data.languages ?? []) as UnifiedLanguageCode[],
				}}
			>
				<FormField
					name="type"
					options={typeOptions}
					disabled={!!data.postToEdit}
				/>
				<FormField name="timezone" options={timezoneOptions} />
				<FormField name="postText" />
				<ConditionalFields
					isPlusServerMember={isPlusServerMember}
					plusTierOptions={plusTierOptions}
				/>
				<FormField name="languages" />
				<ConditionalWeaponPool />
			</SendouForm>
		</Main>
	);
}

function ConditionalFields({
	isPlusServerMember,
	plusTierOptions,
}: {
	isPlusServerMember: boolean;
	plusTierOptions: SelectOption[];
}) {
	const { values } = useFormFieldContext();
	const type = values.type as Tables["LFGPost"]["type"];

	return isPlusServerMember && type !== "COACH_FOR_TEAM" ? (
		<FormField name="plusTierVisibility" options={plusTierOptions} />
	) : null;
}

function ConditionalWeaponPool() {
	const { values } = useFormFieldContext();
	const type = values.type as Tables["LFGPost"]["type"];

	return type !== "COACH_FOR_TEAM" ? <WeaponPool /> : null;
}

function WeaponPool() {
	const { t } = useTranslation(["lfg"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<Label>{t("lfg:new.weaponPool.header")}</Label>
			<div className="stack horizontal sm">
				{data.weaponPool?.map(({ weaponSplId }) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						size={32}
						variant="build"
					/>
				))}
			</div>
			<FormMessage type="info">
				{t("lfg:new.editOn")}{" "}
				<Link to={userEditProfilePage(user!)}>
					{t("lfg:new.weaponPool.userProfile")}
				</Link>
			</FormMessage>
		</div>
	);
}

const useAvailablePostTypes = () => {
	const data = useLoaderData<typeof loader>();

	return (
		LFG.types
			// can't look for a team, if not in one
			.filter((type) => data.team || !TEAM_POST_TYPES.includes(type))
			// can't post two posts of same type
			.filter(
				(type) =>
					!data.userPostTypes.includes(type) || data.postToEdit?.type === type,
			)
	);
};

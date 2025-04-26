import { type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { countries } from "countries-list";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { translatedCountry } from "~/utils/i18n.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { userPage } from "~/utils/urls";
import { userParamsSchema } from "../user-page-schemas.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const locale = await i18next.getLocale(request);

	const user = await requireUser(request);
	const { identifier } = userParamsSchema.parse(params);
	const userToBeEdited = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier),
	);
	if (user.id !== userToBeEdited.id) {
		throw redirect(userPage(userToBeEdited));
	}

	const userProfile = (await UserRepository.findProfileByIdentifier(
		identifier,
		true,
	))!;

	return {
		user: userProfile,
		favoriteBadgeIds: user.favoriteBadgeIds,
		discordUniqueName: userProfile.discordUniqueName,
		countries: Object.entries(countries)
			.map(([code, country]) => ({
				code,
				name:
					translatedCountry({
						countryCode: code,
						language: locale,
					}) ?? country.name,
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
	};
};

import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	type ActionFunction,
	type MetaFunction,
	redirect,
	useLoaderData,
	useSearchParams,
} from "react-router";
import { Main } from "~/components/Main";
import type { HideableUserCardStat, XRankPlacementRegion } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { existingImage } from "~/form/image-field";
import { parseFormDataWithImages } from "~/form/parse.server";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userCardEditPage, userPage } from "~/utils/urls";
import { PRESET_COLORS } from "../../tier-list-maker/tier-list-maker-constants";
import * as UserCardRepository from "../UserCardRepository.server";
import { USER_CARD } from "../user-card-constants";
import { updateUserCardSchema } from "../user-card-schemas";
import styles from "./user-card.edit.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Edit user card",
		location: args.location,
	});
};

// xxx: loader to different file, project convention
export const loader = async () => {
	const user = requireUser();

	const [{ userCards }, extras] = await Promise.all([
		UserCardRepository.userCards({ userIds: [user.id], viewerId: user.id }),
		UserCardRepository.cardEditExtras(user.id),
	]);

	const card = userCards.get(user.id);
	invariant(card, "card data not found for own user");

	return {
		card,
		extras,
		isSupporter: Boolean(user.roles?.includes("SUPPORTER")),
		maxUnverifiedXp: maxUnverifiedXp(extras.linkedPlayerPeakXp),
		presentStats: card.stats.map((stat) => stat.type),
	};
};

// xxx: action to different file, project convention
export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const returnTo = safeReturnTo(
		new URL(request.url).searchParams.get("returnTo"),
	);

	const result = await parseFormDataWithImages({
		request,
		schema: updateUserCardSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	if (data.unverifiedXpPoints) {
		const linkedPeakXp = await UserCardRepository.linkedPlayerPeakXp(user.id);
		if (data.unverifiedXpPoints > maxUnverifiedXp(linkedPeakXp)) {
			return {
				fieldErrors: { unverifiedXpPoints: "forms:errors.unverifiedXpTooHigh" },
			};
		}
	}

	// xxx: just autovalidate and prevent input from the boundary
	const isSupporter = Boolean(user.roles?.includes("SUPPORTER"));

	await UserCardRepository.updateOwnCard({
		shortBio: data.shortBio || null,
		...resolveBanner({ ...data, isSupporter }),
		unverifiedPeakXP: data.unverifiedXpPoints
			? {
					overall: data.unverifiedXpPoints,
					tentatek:
						data.unverifiedXpDivision === "WEST"
							? data.unverifiedXpPoints
							: null,
					takoroka:
						data.unverifiedXpDivision === "JPN"
							? data.unverifiedXpPoints
							: null,
				}
			: null,
		hiddenCardStats: resolveHiddenStats(data),
	});

	throw redirect(returnTo ?? userPage(user));
};

function safeReturnTo(value: string | null) {
	if (!value) return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;

	return value;
}

function maxUnverifiedXp(linkedPeakXp: number | null) {
	return typeof linkedPeakXp === "number"
		? linkedPeakXp + USER_CARD.MAX_UNVERIFIED_XP_ABOVE_LINKED_PLAYER
		: USER_CARD.MAX_UNVERIFIED_XP_WITHOUT_LINKED_PLAYER;
}

function resolveBanner({
	bannerType,
	bannerColor,
	bannerStageId,
	bannerImage,
	isSupporter,
}: {
	bannerType: "COLOR" | "STAGE" | "URL";
	bannerColor: string;
	bannerStageId: number;
	bannerImage: number | null;
	isSupporter: boolean;
}): { bannerPresetImg: string | null; bannerImgId: number | null } {
	switch (bannerType) {
		case "STAGE":
			return { bannerPresetImg: String(bannerStageId), bannerImgId: null };
		case "URL":
			return {
				bannerPresetImg: null,
				bannerImgId: isSupporter ? bannerImage : null,
			};
		default:
			return { bannerPresetImg: bannerColor, bannerImgId: null };
	}
}

function resolveHiddenStats(data: {
	hideXp: boolean;
	hideDiv: boolean;
}): Array<HideableUserCardStat> {
	return [
		data.hideXp ? ("XP" as const) : null,
		data.hideDiv ? ("DIV" as const) : null,
	].filter((stat) => stat !== null);
}

export default function UserCardEditPage() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const [searchParams] = useSearchParams();

	const returnTo = searchParams.get("returnTo");

	return (
		<Main halfWidth>
			<div className="stack md">
				<h2 className="text-lg">{t("user:card.edit.title")}</h2>
				<SendouForm
					schema={updateUserCardSchema}
					action={returnTo ? userCardEditPage({ returnTo }) : undefined}
					defaultValues={defaultValues(data)}
				>
					<CardEditFields />
				</SendouForm>
			</div>
		</Main>
	);
}

function defaultValues(data: Awaited<ReturnType<typeof loader>>) {
	const { card, extras } = data;
	const banner = card.banner;
	const peakXp = extras.unverifiedPeakXP;

	return {
		shortBio: card.shortBio ?? "",
		bannerType: banner.type,
		bannerColor: banner.type === "COLOR" ? banner.hexCode : PRESET_COLORS[0],
		bannerStageId: banner.type === "STAGE" ? banner.stageId : 1,
		bannerImage: existingImage(extras.bannerImgId, extras.bannerImageUrl),
		unverifiedXpPoints: peakXp?.overall,
		unverifiedXpDivision: (typeof peakXp?.takoroka === "number"
			? "JPN"
			: "WEST") as XRankPlacementRegion,
		hideXp: card.hiddenStats.includes("XP"),
		hideDiv: card.hiddenStats.includes("DIV"),
	};
}

function CardEditFields() {
	const { t } = useTranslation(["user"]);
	const { isSupporter, presentStats } = useLoaderData<typeof loader>();
	const { values } = useFormFieldContext();

	const bannerType = values.bannerType as "COLOR" | "STAGE" | "URL";

	return (
		<div className="stack md">
			<FormField name="shortBio" />
			<FormField name="bannerType" />
			{bannerType === "COLOR" ? <BannerColorField /> : null}
			{bannerType === "STAGE" ? <FormField name="bannerStageId" /> : null}
			{bannerType === "URL" ? (
				isSupporter ? (
					<FormField name="bannerImage" />
				) : (
					<p className={styles.supporterOnly}>
						{t("user:card.edit.supporterOnlyBanner")}
					</p>
				)
			) : null}
			<FormField name="unverifiedXpPoints" />
			<FormField name="unverifiedXpDivision" />
			{presentStats.includes("XP") ? <FormField name="hideXp" /> : null}
			{presentStats.includes("DIV") ? <FormField name="hideDiv" /> : null}
		</div>
	);
}

function BannerColorField() {
	const { t } = useTranslation(["user"]);

	return (
		<FormField name="bannerColor">
			{({ value, onChange }: CustomFieldRenderProps) => (
				<fieldset>
					<legend className={styles.swatchesLegend}>
						{t("user:card.edit.bannerColor")}
					</legend>
					<div className={styles.swatches}>
						{PRESET_COLORS.map((color) => (
							<button
								key={color}
								type="button"
								className={clsx(styles.swatch, {
									[styles.swatchSelected]: value === color,
								})}
								style={{ backgroundColor: color }}
								onClick={() => onChange(color)}
								aria-label={color}
								aria-pressed={value === color}
							/>
						))}
					</div>
				</fieldset>
			)}
		</FormField>
	);
}

import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	type MetaFunction,
	useLoaderData,
	useSearchParams,
} from "react-router";
import { Main } from "~/components/Main";
import type { XRankPlacementRegion } from "~/db/tables";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { existingImage } from "~/form/image-field";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userCardEditPage } from "~/utils/urls";
import { PRESET_COLORS } from "../../tier-list-maker/tier-list-maker-constants";
import { action } from "../actions/user-card.edit.server";
import { loader } from "../loaders/user-card.edit.server";
import { updateUserCardSchema } from "../user-card-schemas";
import styles from "./user-card.edit.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["user"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Edit user card",
		location: args.location,
	});
};

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
		hideXp: extras.hiddenCardStats.includes("XP"),
		hideDiv: extras.hiddenCardStats.includes("DIV"),
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

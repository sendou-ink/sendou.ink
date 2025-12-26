import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SelectFormField } from "~/components/form/SelectFormField";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { WeaponImage } from "~/components/Image";
import { StarIcon } from "~/components/icons/Star";
import { StarFilledIcon } from "~/components/icons/StarFilled";
import { TrashIcon } from "~/components/icons/Trash";
import { StageSelect } from "~/components/StageSelect";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { Tables } from "~/db/tables";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { type allWidgetsFlat, findWidgetById } from "../core/widgets/portfolio";
import styles from "../routes/u.$identifier.module.css";
import { USER } from "../user-page-constants";

export function WidgetSettingsForm({
	widget,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	const schema = getWidgetSchema(widget.id);

	if (!schema) {
		return null;
	}

	return (
		<WidgetSettingsFormInner
			widget={widget}
			schema={schema}
			onSettingsChange={onSettingsChange}
		/>
	);
}

function WidgetSettingsFormInner({
	widget,
	schema,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	schema: WidgetWithSettings["schema"];
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	const { t } = useTranslation(["user"]);
	const methods = useForm({
		resolver: standardSchemaResolver(schema),
		defaultValues: (widget.settings ?? {}) as any,
	});

	const values = useWatch({ control: methods.control });
	const isFirstRender = useRef(true);
	const onSettingsChangeRef = useRef(onSettingsChange);
	const widgetIdRef = useRef(widget.id);

	onSettingsChangeRef.current = onSettingsChange;
	widgetIdRef.current = widget.id;

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}

		if (Object.keys(values).length > 0) {
			onSettingsChangeRef.current(widgetIdRef.current, values);
		}
	}, [values]);

	const formFields = (() => {
		switch (widget.id) {
			case "bio":
				return (
					<TextAreaFormField
						label={t("widgets.forms.bio")}
						name="bio"
						maxLength={USER.BIO_MAX_LENGTH}
					/>
				);
			case "bio-md":
				return (
					<TextAreaFormField
						label={t("widgets.forms.bio")}
						name="bio"
						bottomText={t("widgets.forms.bio.markdownSupport")}
						maxLength={USER.BIO_MD_MAX_LENGTH}
					/>
				);
			case "x-rank-peaks":
				return (
					<SelectFormField
						label={t("widgets.forms.division")}
						name="division"
						values={[
							{ value: "both", label: t("widgets.forms.division.both") },
							{
								value: "tentatek",
								label: t("widgets.forms.division.tentatek"),
							},
							{
								value: "takoroka",
								label: t("widgets.forms.division.takoroka"),
							},
						]}
					/>
				);
			case "timezone":
				return (
					<SelectFormField
						label={t("widgets.forms.timezone")}
						name="timezone"
						values={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
					/>
				);
			case "favorite-stage":
				return (
					<StageSelect
						label={t("widgets.forms.favoriteStage")}
						value={methods.watch("stageId")}
						onChange={(stageId) => methods.setValue("stageId", stageId)}
					/>
				);
			case "peak-xp-weapon":
				return (
					<WeaponSelect
						label={t("widgets.forms.weapon")}
						value={methods.watch("weaponSplId")}
						onChange={(weaponSplId) =>
							methods.setValue("weaponSplId", weaponSplId)
						}
					/>
				);
			case "weapon-pool":
				return (
					<WeaponPoolField
						weapons={methods.watch("weapons")}
						onChange={(weapons) => methods.setValue("weapons", weapons)}
					/>
				);
			default:
				return null;
		}
	})();

	return <FormProvider {...methods}>{formFields}</FormProvider>;
}

type WidgetWithSettings = Extract<
	ReturnType<typeof allWidgetsFlat>[number],
	{ schema: unknown }
>;

function getWidgetSchema(widgetId: string) {
	const widget = findWidgetById(widgetId);
	if (widget && "schema" in widget) {
		return widget.schema;
	}
	return null;
}

function WeaponPoolField({
	weapons,
	onChange,
}: {
	weapons: Array<{ weaponSplId: MainWeaponId; isFavorite: number }>;
	onChange: (
		weapons: Array<{ weaponSplId: MainWeaponId; isFavorite: number }>,
	) => void;
}) {
	const { t } = useTranslation(["user"]);
	const latestWeapon = weapons[weapons.length - 1];

	return (
		<div className={clsx("stack md", styles.weaponPool)}>
			{weapons.length < USER.WEAPON_POOL_MAX_SIZE ? (
				<WeaponSelect
					label={t("user:weaponPool")}
					onChange={(weaponSplId) => {
						onChange([
							...weapons,
							{
								weaponSplId,
								isFavorite: 0,
							},
						]);
					}}
					disabledWeaponIds={weapons.map((w) => w.weaponSplId)}
					// empty on selection
					key={latestWeapon?.weaponSplId ?? "empty"}
				/>
			) : (
				<span className="text-xs text-warning">
					{t("user:forms.errors.maxWeapons")}
				</span>
			)}
			<div className="stack horizontal sm justify-center">
				{weapons.map((weapon) => {
					return (
						<div key={weapon.weaponSplId} className="stack xs">
							<div className="u__weapon">
								<WeaponImage
									weaponSplId={weapon.weaponSplId}
									variant={weapon.isFavorite === 1 ? "badge-5-star" : "badge"}
									width={38}
									height={38}
								/>
							</div>
							<div className="stack sm horizontal items-center justify-center">
								<SendouButton
									icon={
										weapon.isFavorite === 1 ? <StarFilledIcon /> : <StarIcon />
									}
									variant="minimal"
									aria-label="Favorite weapon"
									onPress={() =>
										onChange(
											weapons.map((w) =>
												w.weaponSplId === weapon.weaponSplId
													? {
															...weapon,
															isFavorite: weapon.isFavorite === 1 ? 0 : 1,
														}
													: w,
											),
										)
									}
								/>
								<SendouButton
									icon={<TrashIcon />}
									variant="minimal-destructive"
									aria-label="Delete weapon"
									onPress={() =>
										onChange(
											weapons.filter(
												(w) => w.weaponSplId !== weapon.weaponSplId,
											),
										)
									}
									size="small"
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

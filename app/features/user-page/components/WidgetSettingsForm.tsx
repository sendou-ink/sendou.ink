import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Tables } from "~/db/tables";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import {
	CONTROLLERS,
	getWidgetFormSchema,
	TIMEZONE_OPTIONS,
} from "../core/widgets/widget-form-schemas";
import styles from "../routes/u.$identifier.module.css";
import { USER } from "../user-page-constants";
import { GameBadgeSelectField } from "./GameBadgeSelectField";

export function WidgetSettingsForm({
	widget,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	onSettingsChange: (widgetId: string, settings: unknown) => void;
}) {
	const schema = getWidgetFormSchema(widget.id);

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
	schema: ReturnType<typeof getWidgetFormSchema>;
	onSettingsChange: (widgetId: string, settings: unknown) => void;
}) {
	if (!schema) return null;

	const handleApply = (values: unknown) => {
		onSettingsChange(widget.id, values);
	};

	const defaultValues = transformSettingsForForm(
		widget.id,
		widget.settings ?? {},
	);

	return (
		<SendouForm
			schema={schema}
			defaultValues={defaultValues}
			autoApply
			onApply={handleApply}
			className="stack md"
		>
			<WidgetFormFields widgetId={widget.id} />
		</SendouForm>
	);
}

function WidgetFormFields({ widgetId }: { widgetId: string }) {
	switch (widgetId) {
		case "bio":
		case "bio-md":
			return <FormField name="bio" />;
		case "x-rank-peaks":
			return <FormField name="division" />;
		case "timezone":
			return <FormField name="timezone" options={TIMEZONE_OPTIONS} />;
		case "favorite-stage":
			return <FormField name="stageId" />;
		case "peak-xp-unverified":
			return (
				<div className="stack md">
					<FormField name="peakXp" />
					<FormField name="division" />
				</div>
			);
		case "peak-xp-weapon":
			return <FormField name="weaponSplId" />;
		case "weapon-pool":
			return <FormField name="weapons" />;
		case "sens":
			return <SensFields />;
		case "art":
			return <FormField name="source" />;
		case "links":
			return <FormField name="links" />;
		case "tier-list":
			return (
				<FormField name="searchParams">
					{(props: CustomFieldRenderProps) => (
						<TierListField {...(props as CustomFieldRenderProps<string>)} />
					)}
				</FormField>
			);
		case "game-badges":
			return (
				<FormField name="badgeIds">
					{(props: CustomFieldRenderProps) => (
						<GameBadgeSelectField
							{...(props as CustomFieldRenderProps<string[]>)}
							maxCount={USER.GAME_BADGES_MAX}
						/>
					)}
				</FormField>
			);
		case "game-badges-small":
			return (
				<FormField name="badgeIds">
					{(props: CustomFieldRenderProps) => (
						<GameBadgeSelectField
							{...(props as CustomFieldRenderProps<string[]>)}
							maxCount={USER.GAME_BADGES_SMALL_MAX}
						/>
					)}
				</FormField>
			);
		default:
			return null;
	}
}

function transformSettingsForForm(
	widgetId: string,
	settings: Record<string, unknown>,
): Record<string, unknown> {
	if (widgetId === "weapon-pool" && settings.weapons) {
		const weapons = settings.weapons as Array<{
			weaponSplId?: number;
			id?: number;
			isFavorite: number | boolean;
		}>;
		return {
			...settings,
			weapons: weapons.map((w) => ({
				id: w.id ?? w.weaponSplId,
				isFavorite: w.isFavorite === 1 || w.isFavorite === true,
			})),
		};
	}
	return settings;
}

const SENS_OPTIONS = [
	-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35,
	40, 45, 50,
];

function SensFields() {
	const { t } = useTranslation(["user"]);
	const { values, setValue, onFieldChange } = useFormFieldContext();

	const controller =
		(values.controller as (typeof CONTROLLERS)[number]) ?? "s2-pro-con";
	const motionSens = (values.motionSens as number | null) ?? null;
	const stickSens = (values.stickSens as number | null) ?? null;

	const rawSensToString = (sens: number) =>
		`${sens > 0 ? "+" : ""}${sens / 10}`;

	const handleControllerChange = (
		newController: (typeof CONTROLLERS)[number],
	) => {
		setValue("controller", newController);
		onFieldChange?.("controller", newController);
	};

	const handleMotionSensChange = (sens: number | null) => {
		setValue("motionSens", sens);
		onFieldChange?.("motionSens", sens);
	};

	const handleStickSensChange = (sens: number | null) => {
		setValue("stickSens", sens);
		onFieldChange?.("stickSens", sens);
	};

	return (
		<div className="stack md">
			<div>
				<label htmlFor="controller">{t("widgets.forms.controller")}</label>
				<select
					id="controller"
					value={controller}
					onChange={(e) =>
						handleControllerChange(
							e.target.value as (typeof CONTROLLERS)[number],
						)
					}
					className={clsx(styles.sensSelect)}
				>
					{CONTROLLERS.map((ctrl) => (
						<option key={ctrl} value={ctrl}>
							{t(`user:controllers.${ctrl}`)}
						</option>
					))}
				</select>
			</div>

			<div className="stack horizontal md">
				<div>
					<label htmlFor="motionSens">{t("user:motionSens")}</label>
					<select
						id="motionSens"
						value={motionSens ?? ""}
						onChange={(e) =>
							handleMotionSensChange(
								e.target.value === "" ? null : Number(e.target.value),
							)
						}
						className={clsx(styles.sensSelect)}
					>
						<option value="">{"-"}</option>
						{SENS_OPTIONS.map((sens) => (
							<option key={sens} value={sens}>
								{rawSensToString(sens)}
							</option>
						))}
					</select>
				</div>

				<div>
					<label htmlFor="stickSens">{t("user:stickSens")}</label>
					<select
						id="stickSens"
						value={stickSens ?? ""}
						onChange={(e) =>
							handleStickSensChange(
								e.target.value === "" ? null : Number(e.target.value),
							)
						}
						className={clsx(styles.sensSelect)}
					>
						<option value="">{"-"}</option>
						{SENS_OPTIONS.map((sens) => (
							<option key={sens} value={sens}>
								{rawSensToString(sens)}
							</option>
						))}
					</select>
				</div>
			</div>
		</div>
	);
}

function TierListField({ value, onChange }: CustomFieldRenderProps<string>) {
	const { t } = useTranslation(["user"]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value;

		if (inputValue.includes("/tier-list-maker")) {
			try {
				const url = new URL(inputValue, "https://sendou.ink");
				const extractedSearchParams = url.search.substring(1);
				onChange(extractedSearchParams);
				return;
			} catch {
				// not a valid URL, just use the value as-is
			}
		}

		onChange(inputValue);
	};

	return (
		<div>
			<label htmlFor="tier-list-searchParams">
				{t("widgets.forms.tierListUrl")}
			</label>
			<div className="input-container">
				<div className="input-addon">/tier-list-maker?</div>
				<input
					id="tier-list-searchParams"
					value={value ?? ""}
					onChange={handleChange}
				/>
			</div>
		</div>
	);
}

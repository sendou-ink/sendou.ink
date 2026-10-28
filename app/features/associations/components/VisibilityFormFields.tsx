import * as React from "react";
import { useTranslation } from "react-i18next";
import type * as v from "valibot";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { DatetimeFormField } from "~/form/fields/DatetimeFormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { useFormFieldContext } from "~/form/SendouForm";
import type { notFoundVisibilityField } from "../associations-schemas";
import styles from "./VisibilityFormFields.module.css";

/** Associations of the user the content can be limited to, as returned by `AssociationRepository.findByMemberUserId`. */
export interface VisibilityAssociations {
	virtual: string[];
	actual: Array<{ id: number; name: string }>;
}

const DEFAULT_NOT_FOUND_VISIBILITY = {
	at: null,
	forAssociation: "PUBLIC",
} as const;

/**
 * Picks who sees the content at first, for a form schema using `baseVisibilityField` (or
 * `baseVisibilityWithLinkOnlyField` with `isLinkOnlyAvailable`). Uses the "scrims" namespace.
 */
export function BaseVisibilityFormField({
	associations,
	isLinkOnlyAvailable = false,
	name,
	value,
	onChange,
	error,
}: {
	associations: VisibilityAssociations;
	isLinkOnlyAvailable?: boolean;
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}) {
	const { t } = useTranslation(["scrims"]);
	const { setValue } = useFormFieldContext();
	const id = React.useId();

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={t("scrims:forms.visibility.title")}
			error={error}
		>
			{noAssociations && !isLinkOnlyAvailable ? (
				<FormMessage type="info">
					{t("scrims:forms.visibility.noneAvailable")}
				</FormMessage>
			) : (
				<AssociationSelect
					associations={associations}
					isLinkOnlyAvailable={isLinkOnlyAvailable}
					id={id}
					value={String(value)}
					onChange={(e) => {
						onChange(e.target.value);
						if (e.target.value === "PUBLIC" || e.target.value === "LINK_ONLY") {
							setValue("notFoundVisibility", DEFAULT_NOT_FOUND_VISIBILITY);
						}
					}}
				/>
			)}
		</FormFieldWrapper>
	);
}

/**
 * Picks who sees the content in addition from a later time on, for a form schema using `notFoundVisibilityField`.
 * Hidden while the base visibility is public.
 */
export function NotFoundVisibilityFormField({
	associations,
}: {
	associations: VisibilityAssociations;
}) {
	const { t } = useTranslation(["scrims", "forms"]);
	const { values, setValue, clientErrors, serverErrors } =
		useFormFieldContext();
	const baseVisibility = values.baseVisibility as string;
	const notFoundVisibility = values.notFoundVisibility as v.InferOutput<
		typeof notFoundVisibilityField
	>;

	const error =
		serverErrors.notFoundVisibility ?? clientErrors.notFoundVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	if (
		noAssociations ||
		baseVisibility === "PUBLIC" ||
		baseVisibility === "LINK_ONLY"
	) {
		return null;
	}

	const handleDateChange = (val: Date | undefined) => {
		setValue("notFoundVisibility", {
			...notFoundVisibility,
			at: val ?? null,
		});
	};

	const handleAssociationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setValue("notFoundVisibility", {
			...notFoundVisibility,
			forAssociation: e.target.value,
		});
	};

	const dateValue = notFoundVisibility.at
		? new Date(notFoundVisibility.at)
		: undefined;

	return (
		<div>
			<div className="stack horizontal sm">
				<div className={styles.datePickerFullWidth}>
					<DatetimeFormField
						name="notFoundVisibility"
						label="scrims:forms.notFoundVisibility.title"
						required={false}
						error={error}
						value={dateValue}
						onChange={handleDateChange}
						bottomText={
							notFoundVisibility.at
								? undefined
								: "scrims:forms.notFoundVisibility.explanation"
						}
					/>
				</div>
				{notFoundVisibility.at ? (
					<div className="w-full">
						<Label htmlFor="not-found-visibility">
							{t("scrims:forms.visibility.title")}
						</Label>
						<AssociationSelect
							associations={associations}
							id="not-found-visibility"
							value={String(notFoundVisibility.forAssociation)}
							onChange={handleAssociationChange}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}

function AssociationSelect({
	associations,
	isLinkOnlyAvailable = false,
	id,
	value,
	onChange,
}: {
	associations: VisibilityAssociations;
	isLinkOnlyAvailable?: boolean;
	id: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
	const { t } = useTranslation(["scrims"]);

	return (
		<select id={id} className="w-full" value={value} onChange={onChange}>
			<option value="PUBLIC">{t("scrims:forms.visibility.public")}</option>
			{isLinkOnlyAvailable ? (
				<option value="LINK_ONLY">
					{t("scrims:forms.visibility.linkOnly")}
				</option>
			) : null}
			{associations.virtual.map((association) => (
				<option key={association} value={association}>
					{association === "FRIENDS"
						? t("scrims:forms.visibility.friends")
						: association}
				</option>
			))}
			{associations.actual.map((association) => (
				<option key={association.id} value={association.id}>
					{association.name}
				</option>
			))}
		</select>
	);
}

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useSearchParams } from "react-router";
import type { z } from "zod";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FilterFilledIcon } from "~/components/icons/FilterFilled";
import { useUser } from "~/features/auth/core/user";
import type { ScrimFilters } from "~/features/scrims/scrims-types";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { scrimsFiltersFormSchema } from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";

type FormValues = z.infer<typeof scrimsFiltersFormSchema>;

export function ScrimFiltersDialog({ filters }: { filters: ScrimFilters }) {
	const { t } = useTranslation(["scrims"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<FilterFilledIcon />}
				onPress={() => setIsOpen(true)}
				data-testid="filter-scrims-button"
			>
				{t("scrims:filters.button")}
			</SendouButton>
			<SendouDialog
				heading={t("scrims:filters.heading")}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
			>
				<FiltersForm
					filters={filters}
					closeDialog={() => {
						setIsOpen(false);
					}}
				/>
			</SendouDialog>
		</>
	);
}

function filtersToFormValues(filters: ScrimFilters): FormValues {
	return {
		weekdayTimes: filters.weekdayTimes,
		weekendTimes: filters.weekendTimes,
		divs: filters.divs ? [filters.divs.max, filters.divs.min] : [null, null],
	};
}

function formValuesToFilters(values: FormValues): ScrimFilters {
	const [max, min] = values.divs ?? [null, null];
	return {
		weekdayTimes: values.weekdayTimes,
		weekendTimes: values.weekendTimes,
		divs:
			max || min
				? { max: max as LutiDiv | null, min: min as LutiDiv | null }
				: null,
	};
}

function FiltersForm({
	filters,
	closeDialog,
}: {
	filters: ScrimFilters;
	closeDialog: () => void;
}) {
	const user = useUser();
	const { t } = useTranslation(["scrims"]);
	const fetcher = useFetcher();
	const [, setSearchParams] = useSearchParams();

	const defaultValues = filtersToFormValues(filters);

	const applyFilters = (scrimFilters: ScrimFilters) => {
		setSearchParams((prev) => {
			prev.set("filters", JSON.stringify(scrimFilters));
			return prev;
		});
	};

	const handleApply = (values: FormValues) => {
		applyFilters(formValuesToFilters(values));
		closeDialog();
	};

	const handleApplyAndPersist = (values: FormValues) => {
		const scrimFilters = formValuesToFilters(values);
		applyFilters(scrimFilters);

		// xxx: this should be part of the SendouForm
		fetcher.submit(
			{
				_action: "PERSIST_SCRIM_FILTERS",
				filters: scrimFilters,
			} as unknown as Parameters<typeof fetcher.submit>[0],
			{
				method: "post",
				encType: "application/json",
			},
		);

		closeDialog();
	};

	return (
		<SendouForm
			schema={scrimsFiltersFormSchema}
			defaultValues={defaultValues}
			onApply={handleApply}
			submitButtonText={t("scrims:filters.apply")}
			className="stack md-plus items-start"
		>
			{({ names }) => (
				<>
					<FormField name={names.weekdayTimes} />
					<FormField name={names.weekendTimes} />
					<FormField name={names.divs} />
					{user ? (
						<ApplyAndPersistButton
							onApplyAndPersist={handleApplyAndPersist}
							fetcher={fetcher}
						/>
					) : null}
				</>
			)}
		</SendouForm>
	);
}

// xxx: this button is off, maybe as part of the form really?
function ApplyAndPersistButton({
	onApplyAndPersist,
	fetcher,
}: {
	onApplyAndPersist: (values: FormValues) => void;
	fetcher: ReturnType<typeof useFetcher>;
}) {
	const { t } = useTranslation(["scrims"]);
	const context = useFormFieldContext();

	const handlePress = () => {
		const values = context.values as FormValues;
		onApplyAndPersist(values);
	};

	return (
		<div className="w-full flex justify-center">
			<SendouButton
				variant="outlined"
				onPress={handlePress}
				isDisabled={fetcher.state === "submitting"}
			>
				{t("scrims:filters.applyAndDefault")}
			</SendouButton>
		</div>
	);
}

import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import type { z } from "zod";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FilterFilledIcon } from "~/components/icons/FilterFilled";
import { useUser } from "~/features/auth/core/user";
import { calendarFiltersFormSchema } from "~/features/calendar/calendar-schemas";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";

type FormValues = z.infer<typeof calendarFiltersFormSchema>;

export function FiltersDialog({ filters }: { filters: CalendarFilters }) {
	const { t } = useTranslation(["calendar"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				size="small"
				icon={<FilterFilledIcon />}
				onPress={() => setIsOpen(true)}
				data-testid="filter-events-button"
			>
				{t("calendar:filter.button")}
			</SendouButton>
			<SendouDialog
				heading={t("calendar:filter.heading")}
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

function FiltersForm({
	filters,
	closeDialog,
}: {
	filters: CalendarFilters;
	closeDialog: () => void;
}) {
	const user = useUser();
	const { t } = useTranslation(["calendar"]);
	const [, setSearchParams] = useSearchParams();

	const handleApply = (values: FormValues) => {
		setSearchParams((prev) => {
			prev.set("filters", JSON.stringify(values));
			return prev;
		});
		closeDialog();
	};

	return (
		<SendouForm
			schema={calendarFiltersFormSchema}
			defaultValues={filters as unknown as FormValues}
			onApply={handleApply}
			submitButtonText={t("calendar:filter.apply")}
			className="stack md-plus items-start"
			secondarySubmit={user ? <ApplyAndPersistButton /> : null}
		>
			{({ FormField }) => (
				<>
					<FormField name="modes" />
					<FormField name="modesExact" />
					<FormField name="games" />
					<FormField name="preferredVersus" />
					<FormField name="preferredStartTime" />
					<FormField name="tagsIncluded" />
					<FormField name="tagsExcluded" />
					<FormField name="isSendou" />
					<FormField name="isRanked" />
					<FormField name="minTeamCount" />
					<FormField name="orgsIncluded" />
					<FormField name="orgsExcluded" />
					<FormField name="authorIdsExcluded" />
				</>
			)}
		</SendouForm>
	);
}

function ApplyAndPersistButton() {
	const { t } = useTranslation(["calendar"]);
	const { values, submitToServer, fetcherState } = useFormFieldContext();

	return (
		<SendouButton
			variant="outlined"
			onPress={() => submitToServer(values as CalendarFilters)}
			isDisabled={fetcherState !== "idle"}
		>
			{t("calendar:filter.applyAndDefault")}
		</SendouButton>
	);
}

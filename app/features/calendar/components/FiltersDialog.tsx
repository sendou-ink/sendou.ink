import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useSearchParams } from "react-router";
import type { z } from "zod";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FilterFilledIcon } from "~/components/icons/FilterFilled";
import { useUser } from "~/features/auth/core/user";
import { calendarFiltersFormSchema } from "~/features/calendar/calendar-schemas";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import { FormField } from "~/form/FormField";
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
	const fetcher = useFetcher();
	const [, setSearchParams] = useSearchParams();

	const applyFilters = (newFilters: CalendarFilters) => {
		setSearchParams((prev) => {
			prev.set("filters", JSON.stringify(newFilters));
			return prev;
		});
	};

	const handleApply = (values: FormValues) => {
		applyFilters(values as unknown as CalendarFilters);
		closeDialog();
	};

	// xxx: or via normal form?
	const handleApplyAndPersist = (values: FormValues) => {
		const calendarFilters = values as unknown as CalendarFilters;
		applyFilters(calendarFilters);
		fetcher.submit(calendarFilters as Parameters<typeof fetcher.submit>[0], {
			method: "post",
			encType: "application/json",
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
		>
			{({ names }) => (
				<>
					<FormField name={names.modes} />
					<FormField name={names.modesExact} />
					<FormField name={names.games} />
					<FormField name={names.preferredVersus} />
					<FormField name={names.preferredStartTime} />
					<FormField name={names.tagsIncluded} />
					<FormField name={names.tagsExcluded} />
					<FormField name={names.isSendou} />
					<FormField name={names.isRanked} />
					<FormField name={names.minTeamCount} />
					<FormField name={names.orgsIncluded} />
					<FormField name={names.orgsExcluded} />
					<FormField name={names.authorIdsExcluded} />
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

function ApplyAndPersistButton({
	onApplyAndPersist,
	fetcher,
}: {
	onApplyAndPersist: (values: FormValues) => void;
	fetcher: ReturnType<typeof useFetcher>;
}) {
	const { t } = useTranslation(["calendar"]);
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
				{t("calendar:filter.applyAndDefault")}
			</SendouButton>
		</div>
	);
}

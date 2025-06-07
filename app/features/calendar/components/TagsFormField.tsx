import * as React from "react";
import { Tag, TagGroup, TagList } from "react-aria-components";
import {
	Controller,
	type FieldPath,
	type FieldValues,
	get,
	useFormContext,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import type { CalendarEventTag } from "~/db/tables";
import { CALENDAR_EVENT } from "~/features/calendar/calendar-constants";
import { tags as allTags } from "../calendar-constants";

import styles from "./TagsFormField.module.css";

export function TagsFormField<T extends FieldValues>({
	label,
	name,
	bottomText,
	tagsToOmit,
}: {
	label: string;
	name: FieldPath<T>;
	bottomText?: string;
	tagsToOmit?: Array<CalendarEventTag>;
}) {
	const methods = useFormContext();
	const id = React.useId();

	const error = get(methods.formState.errors, name);

	return (
		<div className="w-full">
			<Label htmlFor={id}>{label}</Label>
			<Controller
				control={methods.control}
				name={name}
				render={({ field: { onChange, value, ref } }) => (
					<SelectableTags
						selectedTags={value}
						onSelectionChange={onChange}
						tagsToOmit={tagsToOmit}
						ref={ref}
					/>
				)}
			/>
			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
		</div>
	);
}

export const SelectableTags = React.forwardRef<
	HTMLDivElement,
	{
		selectedTags: Array<CalendarEventTag>;
		tagsToOmit?: Array<CalendarEventTag>;
		onSelectionChange: (selectedTags: Array<CalendarEventTag>) => void;
	}
>(({ selectedTags, tagsToOmit, onSelectionChange }, ref) => {
	const { t } = useTranslation();

	const availableTags = tagsToOmit
		? CALENDAR_EVENT.TAGS.filter((tag) => !tagsToOmit?.includes(tag))
		: CALENDAR_EVENT.TAGS;

	return (
		<TagGroup
			className={styles.tagGroup}
			selectionMode="multiple"
			selectedKeys={selectedTags}
			onSelectionChange={(newSelection) =>
				onSelectionChange(Array.from(newSelection) as CalendarEventTag[])
			}
			aria-label="Select tags"
			ref={ref}
		>
			<TagList className={styles.tagList}>
				{availableTags.map((tag) => {
					return (
						<Tag
							key={tag}
							id={tag}
							className={styles.tag}
							style={{ "--tag-color": allTags[tag].color }}
						>
							{t(`tag.name.${tag}`)}
						</Tag>
					);
				})}
			</TagList>
		</TagGroup>
	);
});

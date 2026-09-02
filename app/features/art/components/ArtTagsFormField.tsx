import { X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import type { CustomFieldRenderProps } from "~/form";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { ART } from "../art-constants";
import styles from "./ArtTagsFormField.module.css";
import { TagSelect } from "./TagSelect";

export type ArtTag = { name?: string; id?: number };

type ArtTagsFormFieldProps = Omit<CustomFieldRenderProps<ArtTag[]>, "name"> & {
	existingTags: Array<{ id: number; name: string }>;
};

// NOTE: a tag added by another user while this form is open will crash on submit
export function ArtTagsFormField({
	value,
	onChange,
	error,
	existingTags,
}: ArtTagsFormFieldProps) {
	const id = React.useId();
	const { t } = useTranslation(["art", "common"]);
	const [creationMode, setCreationMode] = React.useState(false);
	const [newTagValue, setNewTagValue] = React.useState("");

	const handleAddNewTag = () => {
		const normalizedNewTagValue = newTagValue
			.trim()
			.replace(/\s\s+/g, " ")
			.toLowerCase();

		if (
			normalizedNewTagValue.length === 0 ||
			normalizedNewTagValue.length > ART.TAG_MAX_LENGTH
		) {
			return;
		}

		const alreadyCreatedTag = existingTags.find(
			(tag) => tag.name === normalizedNewTagValue,
		);

		if (alreadyCreatedTag) {
			onChange([...value, alreadyCreatedTag]);
		} else if (value.every((tag) => tag.name !== normalizedNewTagValue)) {
			onChange([...value, { name: normalizedNewTagValue }]);
		}

		setNewTagValue("");
		setCreationMode(false);
	};

	return (
		<FormFieldWrapper
			id={id}
			name="tags"
			label={t("art:forms.tags.title")}
			error={error}
		>
			<div className="stack xs">
				{value.length >= ART.TAGS_MAX_LENGTH ? (
					<div className="text-sm text-warning">
						{t("art:forms.tags.maxReached")}
					</div>
				) : creationMode ? (
					<>
						<div className="stack horizontal sm items-center">
							<input
								id={id}
								placeholder={t("art:forms.tags.addNew.placeholder")}
								value={newTagValue}
								onChange={(e) => setNewTagValue(e.target.value)}
								onKeyDown={(event) => {
									if (event.code === "Enter") {
										handleAddNewTag();
									}
								}}
							/>
							<SendouButton
								size="small"
								variant="outlined"
								className={styles.addButton}
								onPress={handleAddNewTag}
							>
								{t("common:actions.add")}
							</SendouButton>
						</div>
						<div className="text-xs text-lighter">
							<SendouButton
								variant="minimal"
								className={styles.switcherButton}
								onPress={() => setCreationMode(false)}
							>
								{t("art:forms.tags.selectFromExisting")}
							</SendouButton>
						</div>
					</>
				) : (
					<>
						<TagSelect
							// empty combobox on select
							key={value.length}
							tags={existingTags}
							disabledKeys={value
								.map((tag) => tag.id)
								.filter((id) => id !== undefined)}
							onSelectionChange={(tagName) =>
								onChange([
									...value,
									existingTags.find((tag) => tag.name === tagName)!,
								])
							}
						/>
						<div className="stack horizontal xs items-center text-xs text-lighter">
							{t("art:forms.tags.cantFindExisting")}
							<SendouButton
								variant="minimal"
								className={styles.switcherButton}
								onPress={() => setCreationMode(true)}
							>
								{t("art:forms.tags.addNew")}
							</SendouButton>
						</div>
					</>
				)}
				{value.length > 0 ? (
					<div className="text-sm stack sm flex-wrap horizontal">
						{value.map((tag) => (
							<div key={tag.name} className="stack horizontal xs items-center">
								{tag.name}
								<SendouButton
									icon={<X />}
									size="miniscule"
									variant="minimal-destructive"
									onPress={() =>
										onChange(value.filter((it) => it.name !== tag.name))
									}
								/>
							</div>
						))}
					</div>
				) : null}
			</div>
		</FormFieldWrapper>
	);
}

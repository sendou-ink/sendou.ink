import { useState } from "react";
import { Alert } from "~/components/Alert";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { toastQueue } from "~/components/elements/Toast";
import { InfoPopover } from "~/components/InfoPopover";
import { Input } from "~/components/Input";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { EditIcon } from "~/components/icons/Edit";
import { PlusIcon } from "~/components/icons/Plus";
import { SearchIcon } from "~/components/icons/Search";
import { TrashIcon } from "~/components/icons/Trash";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { Section } from "~/components/Section";
import { SubmitButton } from "~/components/SubmitButton";
import styles from "../components-showcase.module.css";

export default function ComponentsShowcasePage() {
	return (
		<Main className="stack lg">
			<h1>Components</h1>
			<ButtonsSection />
			<AlertsSection />
			<InputsSection />
			<SelectSection />
			<SwitchSection />
			<TabsSection />
			<DialogSection />
			<PopoverSection />
			<MenuSection />
			<ToastSection />
			<DividerSection />
			<MiscSection />
		</Main>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className={styles.sectionTitle}>{children}</h2>;
}

function ComponentRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.componentRow}>
			<div className={styles.componentLabel}>{label}</div>
			<div className={styles.componentContent}>{children}</div>
		</div>
	);
}

function ButtonsSection() {
	return (
		<Section>
			<SectionTitle>Buttons</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Primary (default)">
					<SendouButton>Primary Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Success">
					<SendouButton variant="success">Success Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Destructive">
					<SendouButton variant="destructive">Destructive Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined">
					<SendouButton variant="outlined">Outlined Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined Success">
					<SendouButton variant="outlined-success">
						Outlined Success
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Outlined Destructive">
					<SendouButton variant="outlined-destructive">
						Outlined Destructive
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal">
					<SendouButton variant="minimal">Minimal Button</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal Success">
					<SendouButton variant="minimal-success">Minimal Success</SendouButton>
				</ComponentRow>

				<ComponentRow label="Minimal Destructive">
					<SendouButton variant="minimal-destructive">
						Minimal Destructive
					</SendouButton>
				</ComponentRow>

				<Divider smallText>Sizes</Divider>

				<ComponentRow label="Miniscule">
					<SendouButton size="miniscule">Miniscule</SendouButton>
				</ComponentRow>

				<ComponentRow label="Small">
					<SendouButton size="small">Small</SendouButton>
				</ComponentRow>

				<ComponentRow label="Medium (default)">
					<SendouButton size="medium">Medium</SendouButton>
				</ComponentRow>

				<ComponentRow label="Big">
					<SendouButton size="big">Big</SendouButton>
				</ComponentRow>

				<Divider smallText>With Icons</Divider>

				<ComponentRow label="Icon + Text">
					<SendouButton icon={<PlusIcon />}>Add Item</SendouButton>
				</ComponentRow>

				<ComponentRow label="Icon Only">
					<SendouButton icon={<EditIcon />} />
				</ComponentRow>

				<ComponentRow label="Destructive with Icon">
					<SendouButton variant="destructive" icon={<TrashIcon />}>
						Delete
					</SendouButton>
				</ComponentRow>

				<Divider smallText>States</Divider>

				<ComponentRow label="Disabled">
					<SendouButton isDisabled>Disabled Button</SendouButton>
				</ComponentRow>

				<Divider smallText>Link Buttons</Divider>

				<ComponentRow label="Internal Link">
					<LinkButton to="/">Go to Home</LinkButton>
				</ComponentRow>

				<ComponentRow label="External Link">
					<LinkButton to="https://github.com" isExternal>
						GitHub
					</LinkButton>
				</ComponentRow>

				<Divider smallText>Submit Button</Divider>

				<ComponentRow label="Submit Button">
					<SubmitButton>Submit Form</SubmitButton>
				</ComponentRow>
			</div>
		</Section>
	);
}

function AlertsSection() {
	return (
		<Section>
			<SectionTitle>Alerts</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Info (default)">
					<Alert>This is an informational alert message.</Alert>
				</ComponentRow>

				<ComponentRow label="Warning">
					<Alert variation="WARNING">
						This is a warning alert. Please be careful!
					</Alert>
				</ComponentRow>

				<ComponentRow label="Error">
					<Alert variation="ERROR">
						This is an error alert. Something went wrong.
					</Alert>
				</ComponentRow>

				<ComponentRow label="Success">
					<Alert variation="SUCCESS">
						This is a success alert. Operation completed!
					</Alert>
				</ComponentRow>

				<ComponentRow label="Tiny">
					<Alert tiny>This is a tiny alert message.</Alert>
				</ComponentRow>
			</div>
		</Section>
	);
}

function InputsSection() {
	return (
		<Section>
			<SectionTitle>Inputs</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Input">
					<Input placeholder="Enter text..." aria-label="Basic input" />
				</ComponentRow>

				<ComponentRow label="With Left Addon">
					<Input leftAddon="@" placeholder="username" aria-label="Username" />
				</ComponentRow>

				<ComponentRow label="With Icon">
					<Input
						icon={<SearchIcon />}
						placeholder="Search..."
						aria-label="Search"
					/>
				</ComponentRow>

				<ComponentRow label="Number Type">
					<Input type="number" min={0} max={100} aria-label="Number input" />
				</ComponentRow>

				<ComponentRow label="Date Type">
					<Input type="date" aria-label="Date input" />
				</ComponentRow>

				<ComponentRow label="Read Only">
					<Input
						readOnly
						defaultValue="Read only value"
						aria-label="Read only"
					/>
				</ComponentRow>

				<ComponentRow label="Textarea">
					<textarea placeholder="Enter text..." aria-label="Textarea" />
				</ComponentRow>

				<Divider smallText>Labels</Divider>

				<ComponentRow label="With Label">
					<div>
						<Label htmlFor="labeled-input">Input Label</Label>
						<Input id="labeled-input" placeholder="Labeled input" />
					</div>
				</ComponentRow>

				<ComponentRow label="Required Label">
					<div>
						<Label htmlFor="required-input" required>
							Required Field
						</Label>
						<Input id="required-input" required placeholder="Required input" />
					</div>
				</ComponentRow>

				<ComponentRow label="With Value Limits">
					<div>
						<Label
							htmlFor="limited-input"
							valueLimits={{ current: 15, max: 50 }}
						>
							Limited Field
						</Label>
						<Input
							id="limited-input"
							maxLength={50}
							defaultValue="Sample text"
						/>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

const SELECT_ITEMS = [
	{ id: "1", name: "Option 1" },
	{ id: "2", name: "Option 2" },
	{ id: "3", name: "Option 3" },
	{ id: "4", name: "Option 4" },
	{ id: "5", name: "Option 5" },
];

function SelectSection() {
	return (
		<Section>
			<SectionTitle>Select</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Select">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Choose an option"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Search">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Searchable Select"
						placeholder="Select..."
						search={{ placeholder: "Search options..." }}
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="Clearable">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Clearable Select"
						placeholder="Select..."
						clearable
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Description">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Select with description"
						description="This is a helpful description"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="With Error">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Select with error"
						errorText="This field is required"
						placeholder="Select..."
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="Disabled">
					<SendouSelect
						items={SELECT_ITEMS}
						label="Disabled Select"
						placeholder="Select..."
						isDisabled
					>
						{(item) => (
							<SendouSelectItem key={item.id} id={item.id}>
								{item.name}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</ComponentRow>

				<ComponentRow label="HTML Select">
					<select>
						{SELECT_ITEMS.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
				</ComponentRow>
			</div>
		</Section>
	);
}

function SwitchSection() {
	const [isOn, setIsOn] = useState(false);
	const [isSmallOn, setIsSmallOn] = useState(true);

	return (
		<Section>
			<SectionTitle>Switch</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Medium (default)">
					<SendouSwitch isSelected={isOn} onChange={setIsOn}>
						Toggle me
					</SendouSwitch>
				</ComponentRow>

				<ComponentRow label="Small">
					<SendouSwitch
						size="small"
						isSelected={isSmallOn}
						onChange={setIsSmallOn}
					>
						Small switch
					</SendouSwitch>
				</ComponentRow>

				<ComponentRow label="Without Label">
					<SendouSwitch aria-label="Toggle without label" />
				</ComponentRow>

				<ComponentRow label="Disabled">
					<SendouSwitch isDisabled>Disabled switch</SendouSwitch>
				</ComponentRow>
			</div>
		</Section>
	);
}

function TabsSection() {
	return (
		<Section>
			<SectionTitle>Tabs</SectionTitle>

			<div className="stack lg">
				<ComponentRow label="Basic Tabs">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="tab1">First Tab</SendouTab>
							<SendouTab id="tab2">Second Tab</SendouTab>
							<SendouTab id="tab3">Third Tab</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="tab1">
							Content for the first tab.
						</SendouTabPanel>
						<SendouTabPanel id="tab2">
							Content for the second tab.
						</SendouTabPanel>
						<SendouTabPanel id="tab3">
							Content for the third tab.
						</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>

				<ComponentRow label="With Icons">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="search" icon={<SearchIcon />}>
								Search
							</SendouTab>
							<SendouTab id="edit" icon={<EditIcon />}>
								Edit
							</SendouTab>
							<SendouTab id="check" icon={<CheckmarkIcon />}>
								Review
							</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="search">Search content here.</SendouTabPanel>
						<SendouTabPanel id="edit">Edit content here.</SendouTabPanel>
						<SendouTabPanel id="check">Review content here.</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>

				<ComponentRow label="With Numbers">
					<SendouTabs>
						<SendouTabList>
							<SendouTab id="pending" number={5}>
								Pending
							</SendouTab>
							<SendouTab id="approved" number={12}>
								Approved
							</SendouTab>
							<SendouTab id="rejected" number={0}>
								Rejected
							</SendouTab>
						</SendouTabList>
						<SendouTabPanel id="pending">5 pending items.</SendouTabPanel>
						<SendouTabPanel id="approved">12 approved items.</SendouTabPanel>
						<SendouTabPanel id="rejected">No rejected items.</SendouTabPanel>
					</SendouTabs>
				</ComponentRow>
			</div>
		</Section>
	);
}

function DialogSection() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Section>
			<SectionTitle>Dialog</SectionTitle>

			<div className="stack md">
				<ComponentRow label="With Trigger">
					<SendouDialog
						trigger={<SendouButton>Open Dialog</SendouButton>}
						heading="Dialog Title"
					>
						<p>This is the content of the dialog.</p>
						<p>
							You can put any content here, including forms, lists, or other
							components.
						</p>
					</SendouDialog>
				</ComponentRow>

				<ComponentRow label="Controlled">
					<div className="stack horizontal sm">
						<SendouButton onPress={() => setIsOpen(true)}>
							Open Controlled Dialog
						</SendouButton>
						<SendouDialog
							isOpen={isOpen}
							onClose={() => setIsOpen(false)}
							heading="Controlled Dialog"
							showCloseButton
						>
							<p>This dialog is controlled via state.</p>
							<SendouButton onPress={() => setIsOpen(false)}>
								Close
							</SendouButton>
						</SendouDialog>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function PopoverSection() {
	return (
		<Section>
			<SectionTitle>Popover</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Popover">
					<SendouPopover
						trigger={<SendouButton>Click for Popover</SendouButton>}
					>
						<p>This is popover content!</p>
					</SendouPopover>
				</ComponentRow>

				<ComponentRow label="Info Popover">
					<div className="stack horizontal sm items-center">
						<span>Some text with help</span>
						<InfoPopover>
							This is additional information shown in a popover.
						</InfoPopover>
					</div>
				</ComponentRow>

				<ComponentRow label="Tiny Info Popover">
					<div className="stack horizontal sm items-center">
						<span>Compact help icon</span>
						<InfoPopover tiny>Tiny popover with less padding.</InfoPopover>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function MenuSection() {
	return (
		<Section>
			<SectionTitle>Menu</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Basic Menu">
					<SendouMenu trigger={<SendouButton>Open Menu</SendouButton>}>
						<SendouMenuItem onAction={() => {}}>Menu Item 1</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Menu Item 2</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Menu Item 3</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="With Icons">
					<SendouMenu trigger={<SendouButton>Menu with Icons</SendouButton>}>
						<SendouMenuItem icon={<EditIcon />} onAction={() => {}}>
							Edit
						</SendouMenuItem>
						<SendouMenuItem icon={<PlusIcon />} onAction={() => {}}>
							Add New
						</SendouMenuItem>
						<SendouMenuItem icon={<TrashIcon />} onAction={() => {}}>
							Delete
						</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="With Active Item">
					<SendouMenu trigger={<SendouButton>Menu with Active</SendouButton>}>
						<SendouMenuItem isActive onAction={() => {}}>
							Active Item
						</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Normal Item</SendouMenuItem>
						<SendouMenuItem onAction={() => {}}>Another Item</SendouMenuItem>
					</SendouMenu>
				</ComponentRow>

				<ComponentRow label="Scrolling Menu">
					<SendouMenu
						scrolling
						trigger={<SendouButton>Scrolling Menu</SendouButton>}
					>
						{Array.from({ length: 10 }, (_, i) => (
							<SendouMenuItem key={i} onAction={() => {}}>
								Item {i + 1}
							</SendouMenuItem>
						))}
					</SendouMenu>
				</ComponentRow>
			</div>
		</Section>
	);
}

function ToastSection() {
	return (
		<Section>
			<SectionTitle>Toast</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Success Toast">
					<SendouButton
						variant="success"
						onPress={() =>
							toastQueue.add({
								message: "Operation completed successfully!",
								variant: "success",
							})
						}
					>
						Show Success Toast
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Error Toast">
					<SendouButton
						variant="destructive"
						onPress={() =>
							toastQueue.add({
								message: "Something went wrong. Please try again.",
								variant: "error",
							})
						}
					>
						Show Error Toast
					</SendouButton>
				</ComponentRow>

				<ComponentRow label="Info Toast">
					<SendouButton
						onPress={() =>
							toastQueue.add({
								message: "Here is some information for you.",
								variant: "info",
							})
						}
					>
						Show Info Toast
					</SendouButton>
				</ComponentRow>
			</div>
		</Section>
	);
}

function DividerSection() {
	return (
		<Section>
			<SectionTitle>Divider</SectionTitle>

			<div className="stack lg">
				<ComponentRow label="Basic Divider">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Content above</p>
						<Divider />
						<p>Content below</p>
					</div>
				</ComponentRow>

				<ComponentRow label="With Text">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Section 1</p>
						<Divider>OR</Divider>
						<p>Section 2</p>
					</div>
				</ComponentRow>

				<ComponentRow label="Small Text">
					<div className="stack sm" style={{ width: "100%" }}>
						<p>Above</p>
						<Divider smallText>small text divider</Divider>
						<p>Below</p>
					</div>
				</ComponentRow>
			</div>
		</Section>
	);
}

function MiscSection() {
	return (
		<Section>
			<SectionTitle>Miscellaneous</SectionTitle>

			<div className="stack md">
				<ComponentRow label="Section Component">
					<Section title="Section Title" className="stack sm">
						<p>This is content inside a Section component.</p>
						<p>It provides consistent styling for content blocks.</p>
					</Section>
				</ComponentRow>
			</div>
		</Section>
	);
}

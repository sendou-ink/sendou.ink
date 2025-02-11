import { Menu as HeadlessUIMenu, Transition } from "@headlessui/react";
import clsx from "clsx";
import * as React from "react";
import { Image } from "./Image";

export interface MenuProps {
	button: React.ElementType;
	items: {
		// type: "button"; TODO: type: "link"
		text: string;
		id: string | number;
		icon?: React.ReactNode;
		imagePath?: string;
		onClick: () => void;
		disabled?: boolean;
		selected?: boolean;
	}[];
	className?: string;
	scrolling?: boolean;
	opensLeft?: boolean;
}

export function Menu({
	button,
	items,
	className,
	scrolling,
	opensLeft,
}: MenuProps) {
	return (
		<HeadlessUIMenu as="div" className={clsx("menu-container", className)}>
			<HeadlessUIMenu.Button as={button} />
			<Transition
				as={React.Fragment}
				enter="transition ease-out duration-100"
				enterFrom="transform opacity-0 scale-95"
				enterTo="transform opacity-100 scale-100"
				leave="transition ease-in duration-75"
				leaveFrom="transform opacity-100 scale-100"
				leaveTo="transform opacity-0 scale-95"
			>
				<HeadlessUIMenu.Items
					className={clsx("menu__items-container", {
						"menu-container__scrolling": scrolling,
						"menu__items-container__opens-left": opensLeft,
					})}
				>
					{items.map((item) => {
						return (
							<HeadlessUIMenu.Item key={item.id} disabled={item.disabled}>
								{({ active }) => (
									<button
										className={clsx("menu__item", {
											menu__item__active: active,
											menu__item__disabled: item.disabled,
											menu__item__selected: item.selected,
										})}
										onClick={item.onClick}
										data-testid={`menu-item-${item.id}`}
										type="button"
									>
										{item.icon ? (
											<span className="menu__item__icon">{item.icon}</span>
										) : null}
										{item.imagePath ? (
											<Image
												path={item.imagePath}
												alt=""
												width={24}
												height={24}
												className="menu__item__img"
											/>
										) : null}
										{item.text}
									</button>
								)}
							</HeadlessUIMenu.Item>
						);
					})}
				</HeadlessUIMenu.Items>
			</Transition>
		</HeadlessUIMenu>
	);
}

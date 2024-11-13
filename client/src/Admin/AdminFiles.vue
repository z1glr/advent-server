<script setup lang="ts">
	import { FEATURES } from "vuefinder/dist/features";
</script>

<template>
	<h1>Files</h1>
	<VueFinder
		id="finder"
		request="/api/storage/browse"
		:features="[
			FEATURES.EDIT,
			FEATURES.NEW_FOLDER,
			FEATURES.PREVIEW,
			FEATURES.RENAME,
			FEATURES.DELETE,
			FEATURES.DOWNLOAD
		]"
	/>
</template>

<style scoped>
	.vuefinder {
		width: 100%;
		height: 100%;

		border-radius: 0.25em;

		outline: none;
	}

	.vuefinder:deep(> div) {
		height: 100%;
	}

	:deep(.vuefinder__main__container) {
		height: 100%;

		max-height: unset !important;

		resize: none !important;

		border: unset;
	}

	:deep(.vuefinder__status-bar__wrapper) {
		display: none !important;
	}

	/* main-container */
	:deep(.vuefinder__main__container),
	:deep(.vuefinder__context-menu) {
		color: var(--color-text) !important;

		background-color: var(--color-background-disabled) !important;

		border: unset;
	}

	/* icons */
	.vuefinder:deep(.stroke-sky-500),
	:deep(.vuefinder__rename-modal__icon),
	:deep(.vuefinder__delete-modal__icon) {
		stroke: var(--color-contrast) !important;
	}

	.vuefinder:deep(.fill-sky-500),
	:deep(.vuefinder__rename-modal__icon),
	:deep(.vuefinder__delete-modal__icon) {
		fill: var(--color-contrast) !important;
	}

	/* list-view */
	:deep(.vf-sort-button),
	:deep(.vuefinder__explorer__header) {
		background-color: var(--color-contrast-disabled) !important;
		border: none !important;
	}

	/* treeview */
	:deep(.vuefinder__treeview__container) {
		background-color: var(--color-background-disabled) !important;
	}

	:deep(.vuefinder__treeview__container *) {
		color: var(--color-text);
	}

	/* accent-items-color */
	:deep(.vuefinder__modal-layout__content input),
	:deep(.vf-explorer-selected),
	:deep(.vf-item-grid:hover),
	:deep(.vuefinder__explorer__item-list-content:hover),
	:deep(.vuefinder__breadcrumb__container *),
	:deep(.vuefinder__treeview__pinned-toggle *),
	:deep(.vuefinder__treestorageitem__header *),
	:deep(.vf-sort-button *),
	:deep(.vuefinder__explorer__header *) {
		color: var(--vt-c-white-light) !important;
	}

	:deep(.vuefinder__modal-layout__content input),
	:deep(.vuefinder__treestorageitem__header),
	:deep(.vuefinder__treeview__pinned-toggle) {
		background-color: var(--color-contrast) !important;

		border: none !important;
	}

	:deep(.vuefinder__treeview__scroll) {
		border: none !important;
	}

	/* nav-bar */
	:deep(.vuefinder__breadcrumb__container) {
		background-color: var(--color-contrast) !important;

		border: none;
	}

	:deep(.vuefinder__breadcrumb__container svg:hover) {
		background-color: var(--color-contrast-hover) !important;
	}

	:deep(.vuefinder__breadcrumb__toggle-tree--active) {
		background-color: var(--color-contrast-disabled) !important;
	}

	/* edit-bar */
	:deep(.vuefinder__toolbar) {
		background-color: var(--color-background-disabled);
	}

	:deep(.vf-toolbar-icon) {
		stroke: var(--color-text) !important;
	}

	:deep(.vf-toolbar-icon:hover) {
		stroke: var(--color-text-hover) !important;
	}

	:deep(.vf-toolbar-icon-disabled) {
		stroke: var(--color-off) !important;
	}

	/* search-bar */
	:deep(.vuefinder__breadcrumb__search-container) {
		background-color: var(--color-background-disabled) !important;
	}

	:deep(.vuefinder__breadcrumb__search-container *) {
		color: var(--vt-c-black) !important;
	}

	:deep(.vuefinder__breadcrumb__search-container svg:hover),
	:deep(
			.vuefinder__breadcrumb__search-container span:hover:not(.vuefinder__breadcrumb__separator)
		) {
		background-color: var(--color-background-hover) !important;
	}

	/* :deep(.hover\:bg-gray-700:hover) {
		background-color: var(--color-contrast-hover) !important;
	} */

	/* :deep(.dark\:hover\:bg-gray-800:hover) {
		background-color: var(--color-background) !important;
	} */

	:deep(.vuefinder__item) {
		border: none;

		border-radius: 0.25em;
	}

	:deep(.vf-item-grid:hover),
	:deep(.vf-item-list:hover) {
		background-color: var(--color-on-hover) !important;
	}

	:deep(div.vf-explorer-selected.vuefinder__item) {
		background-color: var(--color-on) !important;
	}

	/* Popup */
	:deep(.vuefinder__modal-layout__overlay) {
		backdrop-filter: blur(0.5em);

		background-color: unset !important;
	}

	:deep(.vuefinder__modal-layout__content),
	:deep(.vuefinder__modal-layout__footer) {
		background-color: var(--color-background) !important;
	}

	:deep(.vuefinder__modal-layout__content > div > :not(:first-child) *),
	:deep(.vf-toolbar-icon) {
		color: var(--color-text) !important;
	}

	:deep(.vuefinder__modal-layout__content input::placeholder) {
		color: var(--vt-c-white);
	}

	:deep(.vuefinder__modal-header__icon-container) {
		background-color: var(--color-accent) !important;
	}

	:deep(.vuefinder__modal-header__icon-container > svg) {
		stroke: var(--vt-c-white-light) !important;
	}

	:deep(.vf-btn-primary) {
		background-color: var(--color-contrast) !important;
		border: none;
	}

	:deep(.vf-btn-primary:hover) {
		background-color: var(--color-contrast-hover) !important;
	}

	:deep(.vf-btn-secondary) {
		background-color: var(--color-background) !important;

		border-color: var(--color-text) !important;

		color: var(--color-text) !important;
	}

	:deep(.vf-btn-secondary:hover) {
		background-color: var(--color-background-hover) !important;
	}

	:deep(.vf-btn-danger) {
		background-color: var(--color-error) !important;

		border: none;
	}

	:deep(.vf-btn-danger:hover) {
		background-color: var(--color-error-hover) !important;
	}

	:deep(.vuefinder__delete-modal__warning) {
		color: var(--color-error) !important;
	}

	/* :deep(.vuefinder__treestorageitem__header),
	:deep(.vuefinder__treeview__pinned-toggle),
	:deep(.vuefinder__folder-loader-indicator--minus),
	:deep(.vuefinder__folder-indicator--minus),
	:deep(.vuefinder__treestorageitem__icon),
	:deep(.vuefinder__treestorageitem__info) {
		color: var(--vt-c-white) !important;
	} */
</style>

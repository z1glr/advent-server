<script setup lang="ts">
	defineProps<{
		active?: boolean;
		disabled?: boolean;
	}>();
</script>

<template>
	<span class="button" :class="{ active, disabled }">
		<div>
			<slot></slot>
		</div>
	</span>
</template>

<style scoped>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;

		user-select: none;

		transition: background-color 0.1s ease;

		aspect-ratio: 1;
		height: 100%;
		height: 1em;

		margin: 0.25em;
	}

	.button:hover {
		color: var(--color-text-hover);
	}

	.button.disabled {
		color: var(--color-text-disabled);
	}

	.button.active,
	.button:active:not(.disabled) {
		color: var(--color-on);
	}

	.button.disabled.active {
		color: var(--color-on-disabled);
	}

	.button.active:hover,
	.button:active:hover:not(.disabled) {
		color: var(--color-on-hover);
	}

	.button:not(.disabled) {
		cursor: pointer;
	}
</style>

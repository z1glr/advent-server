<script setup lang="ts">
	defineProps<{
		active?: boolean;
		disabled?: boolean;
	}>();
</script>

<template>
	<span
		class="justify-centent m-1 inline-flex aspect-square h-4 select-none items-center transition-colors hover:text-stone-900"
		:class="{
			'cursor-not-allowed text-stone-500 hover:text-stone-500': disabled,
			'cursor-pointer': !disabled
		}"
	>
		<div>
			<slot></slot>
		</div>
	</span>
</template>

<style scoped></style>

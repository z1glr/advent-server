<script setup lang="ts"></script>

<template>
	<div class="bar">
		<slot></slot>
	</div>
</template>

<style scoped>
	.bar {
		display: flex;
		gap: 2em;
	}
</style>

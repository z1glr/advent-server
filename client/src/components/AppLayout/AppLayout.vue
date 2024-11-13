<script setup lang="ts">
	import LayoutHeaderFooter from "./LayoutHeaderFooter.vue";

	import { api_call } from "@/Lib";
	import Global, { type User } from "@/Global";

	const emit = defineEmits<{
		logout: [];
	}>();

	const footer_sites = {
		/* eslint-disable @typescript-eslint/naming-convention */
		About: "/About",
		Datenschutz: "/legal/Datenschutz",
		Impressum: "/legal/Impressum"
		/* eslint-enable @typescript-eslint/naming-convention */
	};

	function is_home(pathname: string): boolean {
		return window.location.pathname === pathname;
	}

	async function logout() {
		const res = await api_call<User>("GET", "logout");

		if (res.ok) {
			Global.user.value = res.data;
			emit("logout");
		}
	}
</script>

<template>
	<LayoutHeaderFooter>
		<a v-if="!is_home('/')" href="/">Home</a>
		<a v-if="Global.user.value?.admin && !is_home('/admin')" href="/admin">Admin</a>

		<slot name="header"></slot>

		<a v-if="Global.user.value?.logged_in" @click="logout">Logout</a>
	</LayoutHeaderFooter>
	<div id="scroll">
		<div id="app_content">
			<slot></slot>
		</div>
	</div>
	<LayoutHeaderFooter id="footer">
		<a
			v-for="[name, url] in Object.entries(footer_sites)"
			:key="name"
			:href="url"
			:class="{ active: is_home(url) }"
		>
			{{ name }}
		</a>
	</LayoutHeaderFooter>
</template>

<style scoped>
	#scroll {
		width: 100%;
		height: 100%;

		overflow: auto;

		display: flex;
		justify-content: center;
	}

	#app_content {
		width: 100%;
		height: 100%;
		max-width: 50em;

		padding-inline: 1em;

		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25em;
	}

	#footer {
		margin-top: auto;

		font-size: 0.75em;
	}

	a:hover {
		color: var(--color-text-hover);
	}

	a.active {
		color: var(--color-contrast);
	}

	a.active:hover {
		color: var(--color-contrast-hover);
	}
</style>

<style>
	#app_mount {
		font-family: "Signika";
		font-size: 1.5em;

		margin: 0 auto;
		padding-block: 0.25em;
		height: 100vh;
		width: 100vw;

		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5em;

		overflow: clip;
	}

	body {
		margin: 0;
	}
</style>

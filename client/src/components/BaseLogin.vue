<script setup lang="ts">
	import { ref } from "vue";

	import Global, { type User } from "@/Global";
	import { api_call, HTTPStatus } from "@/Lib";
	import BaseButton from "./BaseButton.vue";

	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import { faRightToBracket } from "@fortawesome/free-solid-svg-icons";

	const emit = defineEmits<{
		login: [];
	}>();

	const user_input = ref<string>("");
	const password_input = ref<string>("");
	const wrong_password = ref<boolean>(false);

	async function login() {
		const response = await api_call<User>(
			"POST",
			"login",
			undefined,
			{ user: user_input.value, password: password_input.value },
			true
		);

		if (response.ok) {
			wrong_password.value = false;

			Global.user.value = response.data;
			if (response.data.logged_in) {
				emit("login");
			}
		} else {
			if (response.status === HTTPStatus.Unauthorized) {
				wrong_password.value = true;
			}
		}
	}
</script>

<template>
	<div class="flex h-full max-w-60 flex-col justify-center gap-1">
		<h1 class="pl-2 text-4xl">Login</h1>
		<div v-if="wrong_password" class="text-red-500">
			<h2>Login fehlgeschlagen</h2>
			unbekannter Benutzer oder fasches Passwort
		</div>
		<form class="flex w-full items-center gap-1">
			<div class="flex flex-col gap-1">
				<input
					id="username"
					class="w-full bg-teal-600 text-white hover:bg-teal-700 focus:bg-red-600 focus:hover:bg-red-500"
					type="text"
					name="name"
					autocomplete="username"
					:required="true"
					v-model="user_input"
					placeholder="Name"
					@keydown.enter="login"
				/>
				<input
					id="password"
					class="w-full bg-teal-600 text-white hover:bg-teal-700 focus:bg-red-600 focus:hover:bg-red-500"
					type="password"
					name="password"
					autocomplete="current-password"
					:required="true"
					v-model="password_input"
					placeholder="Passwort"
					@keydown.enter="login"
				/>
			</div>
			<BaseButton @click="login">
				<FontAwesomeIcon :icon="faRightToBracket" />
			</BaseButton>
		</form>
	</div>
</template>

<style scoped></style>

<script setup lang="ts">
	import { ref, watch } from "vue";
	import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
	import { faPaperPlane, faTrashCan } from "@fortawesome/free-regular-svg-icons";

	import Global, { type Comment, type Post } from "@/Global";
	import { api_call } from "@/Lib";
	import BaseButton from "../BaseButton.vue";

	const props = defineProps<{
		comment: Comment;
		pid: number;
	}>();

	const emit = defineEmits<{
		answer: [comment: Comment];
		delete: [];
	}>();

	const answer_user_input = ref<string>("");

	watch(
		() => props.comment.answer,
		() => {
			if (props.comment.answer !== undefined) {
				answer_user_input.value = props.comment.answer;
			}
		},
		{ immediate: true }
	);

	async function add_answer(cid: number) {
		const response = await api_call<Comment>(
			"POST",
			"comments/answer",
			{ cid },
			{ answer: answer_user_input.value }
		);

		if (response.ok) {
			emit("answer", response.data);
		}
	}

	async function delete_comment(cid: number) {
		if (window.confirm("Do you really want to delete this comment?")) {
			const response = await api_call<Post>("DELETE", "comments", { cid });

			if (response.ok) {
				emit("delete");
			}
		}
	}
</script>

<template>
	<div class="m-1 rounded-sm p-1 shadow-sm shadow-black outline outline-1 outline-black">
		<div class="comment-text items-center, flex justify-between gap-1 break-words">
			{{ comment.text }}
			<BaseButton @click="delete_comment(comment.cid)">
				<FontAwesomeIcon :icon="faTrashCan" />
			</BaseButton>
		</div>
		<div
			v-if="Global.user.value?.admin"
			id="answer-text"
			class="items-center, m-1 flex justify-between gap-1 break-words"
		>
			<textarea
				class="w-full flex-1 resize-y bg-transparent text-teal-600 placeholder:text-teal-500"
				placeholder="Antwort"
				v-model="answer_user_input"
			/>
			<BaseButton @click="add_answer(comment.cid)"
				><FontAwesomeIcon :icon="faPaperPlane"
			/></BaseButton>
		</div>
		<div v-else-if="!!comment.answer" id="answer-text">{{ comment.answer }}</div>
	</div>
</template>

<style scoped></style>

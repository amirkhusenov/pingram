<script lang="ts" setup>
  import type { FormSubmitEvent } from "@nuxt/ui"
  import { z } from "zod"

  const schema = z.object({
    email: z.string().email("Неверный формат email"),
    password: z.string().min(3, "Пароль должен содержать минимум 3 символа"),
  })

  type Schema = z.infer<typeof schema>

  const state = reactive({
    email: "",
    password: "",
  })

  const loginMutation = useUseLoginUser()

  async function onSubmit(event: FormSubmitEvent<Schema>) {
    await loginMutation.mutateAsync(event.data)
  }

  definePageMeta({
    layout: "auth",
  })
</script>

<template>
  <UContainer class="auth-page">
    <div class="auth-card">
      <h1 class="auth-card__title">Вход</h1>
      <UForm
        class="auth-form"
        @submit="onSubmit"
        :schema="schema"
        :state="state"
      >
        <UFormField label="Почта" name="email">
          <UInput v-model="state.email" class="auth-form__input" />
        </UFormField>

        <UFormField label="Пароль" name="password">
          <UInput v-model="state.password" type="password" class="auth-form__input" />
        </UFormField>

        <ULink to="/register" class="auth-form__link">
          Нет аккаунта? Зарегистрироваться
        </ULink>

        <UButton
          class="auth-form__button"
          :loading="loginMutation.isPending.value"
          :disabled="loginMutation.isPending.value"
          type="submit"
        >
          Войти
        </UButton>
      </UForm>
    </div>
  </UContainer>
</template>

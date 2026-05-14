<script lang="ts" setup>
  import type { FormSubmitEvent } from "@nuxt/ui"
  import { z } from "zod"

  const schema = z
    .object({
      name: z.string().min(3, "Имя должно содержать минимум 3 символа"),
      email: z.string().email("Неверный формат email"),
      password: z.string().min(3, "Пароль должен содержать минимум 3 символа"),
      password_confirmation: z.string(),
    })
    .refine((data) => data.password === data.password_confirmation, {
      message: "Пароли не совпадают",
    })

  type Schema = z.infer<typeof schema>

  const state = reactive({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  })

  const registerMutation = useRegisterUser()

  async function onSubmit(event: FormSubmitEvent<Schema>) {
    await registerMutation.mutateAsync(event.data)
  }

  definePageMeta({
    layout: "auth",
  })
</script>

<template>
  <UContainer class="auth-page">
    <div class="auth-card auth-card--register">
      <h1 class="auth-card__title">Регистрация</h1>
      <UForm
        class="auth-form"
        @submit="onSubmit"
        :schema="schema"
        :state="state"
      >
        <UFormField label="Имя" name="name">
          <UInput v-model="state.name" class="auth-form__input" />
        </UFormField>

        <UFormField label="Почта" name="email">
          <UInput v-model="state.email" class="auth-form__input" />
        </UFormField>

        <UFormField label="Пароль" name="password">
          <UInput v-model="state.password" type="password" class="auth-form__input" />
        </UFormField>

        <UFormField label="Подтверждение пароля" name="password_confirmation">
          <UInput
            v-model="state.password_confirmation"
            type="password"
            class="auth-form__input"
          />
        </UFormField>

        <ULink to="/login" class="auth-form__link">Уже есть аккаунт? Войти</ULink>

        <UButton
          class="auth-form__button"
          :loading="registerMutation.isPending.value"
          :disabled="registerMutation.isPending.value"
          type="submit"
        >
          Зарегистрироваться
        </UButton>
      </UForm>
    </div>
  </UContainer>
</template>

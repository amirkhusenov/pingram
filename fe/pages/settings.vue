<script lang="ts" setup>
type AccentPreset = "lime" | "cyan" | "sunset"

interface AppSettings {
  accentPreset: AccentPreset
}

const STORAGE_KEY = "pingo.settings.v1"

const defaultSettings: AppSettings = {
  accentPreset: "lime",
}

const routeName = useRoute().name
const userProfileQuery = useUserProfile(routeName)
const updateUserProfileMutation = useUpdateProfile()
const backendBaseUrl = useRuntimeConfig().public.BACKEND_BASE_URL
const toast = useToast()

const profileName = ref("")
const profileFile = ref<File | undefined>(undefined)
const profilePreviewUrl = ref<string | null>(null)

const settings = reactive<AppSettings>({ ...defaultSettings })

const accentOptions = [
  { label: "Лайм", value: "lime" },
  { label: "Голубой", value: "cyan" },
  { label: "Закат", value: "sunset" },
]

const accentMap: Record<AccentPreset, string> = {
  lime: "#e2f56b",
  cyan: "#5ee7ff",
  sunset: "#ffb86b",
}

const profileImageUrl = computed(() => {
  if (profilePreviewUrl.value) return profilePreviewUrl.value
  const image = userProfileQuery.data.value?.user?.profile_image
  if (!image) return ""
  if (image.startsWith("http://") || image.startsWith("https://")) return image
  return `${backendBaseUrl}/storage/${image}`
})

function applyAccentPreset(preset: AccentPreset) {
  if (!import.meta.client) return
  document.documentElement.style.setProperty("--accent-lime", accentMap[preset])
}

function saveSettings() {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function loadSettings() {
  if (!import.meta.client) return
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    applyAccentPreset(settings.accentPreset)
    return
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    Object.assign(settings, defaultSettings, parsed)
    applyAccentPreset(settings.accentPreset)
  } catch {
    Object.assign(settings, defaultSettings)
    applyAccentPreset(settings.accentPreset)
  }
}

function resetToDefaults() {
  Object.assign(settings, defaultSettings)
  applyAccentPreset(settings.accentPreset)
  saveSettings()
  toast.add({
    color: "success",
    title: "Настройки сброшены",
    description: "Восстановлены значения по умолчанию",
  })
}

function onProfileFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  profileFile.value = file

  if (profilePreviewUrl.value) {
    URL.revokeObjectURL(profilePreviewUrl.value)
    profilePreviewUrl.value = null
  }

  if (file) {
    profilePreviewUrl.value = URL.createObjectURL(file)
  }
}

async function saveProfile() {
  const normalizedName = profileName.value.trim()
  if (!normalizedName || normalizedName.length < 3) {
    toast.add({
      color: "error",
      title: "Некорректное имя",
      description: "Имя должно содержать минимум 3 символа",
    })
    return
  }

  try {
    await updateUserProfileMutation.mutateAsync({
      name: normalizedName,
      profileFile: profileFile.value,
    })

    profileFile.value = undefined
    if (profilePreviewUrl.value) {
      URL.revokeObjectURL(profilePreviewUrl.value)
      profilePreviewUrl.value = null
    }

    toast.add({
      color: "success",
      title: "Профиль обновлен",
      description: "Изменения профиля успешно сохранены",
    })
  } catch {
    toast.add({
      color: "error",
      title: "Ошибка сохранения",
      description: "Не удалось обновить профиль",
    })
  }
}

watch(
  () => settings.accentPreset,
  (preset) => {
    applyAccentPreset(preset)
  }
)

watch(
  settings,
  () => {
    saveSettings()
  },
  { deep: true }
)

watch(
  () => userProfileQuery.data.value?.user,
  (user) => {
    profileName.value = user?.name ?? ""
  },
  { immediate: true }
)

onMounted(() => {
  loadSettings()
})

onBeforeUnmount(() => {
  if (profilePreviewUrl.value) {
    URL.revokeObjectURL(profilePreviewUrl.value)
  }
})
</script>

<template>
  <section class="settings-page">
    <div class="settings-page__header">
      <h1>Настройки</h1>
      <p>Настройте профиль и внешний вид приложения.</p>
    </div>

    <div class="settings-grid settings-grid--single">
      <UCard class="settings-card settings-card--wide">
        <template #header>
          <h3>Профиль</h3>
        </template>

        <div class="settings-profile">
          <UAvatar :src="profileImageUrl" size="3xl" class="settings-profile__avatar" />

          <div class="settings-profile__fields">
            <UFormField label="Имя">
              <UInput v-model="profileName" placeholder="Введите имя" />
            </UFormField>

            <UFormField label="Фото профиля">
              <UInput type="file" accept="image/*" @change="onProfileFileChange" />
            </UFormField>

            <div class="settings-actions settings-actions--start">
              <UButton
                color="primary"
                :loading="updateUserProfileMutation.isPending.value"
                :disabled="updateUserProfileMutation.isPending.value"
                @click="saveProfile"
              >
                Сохранить профиль
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="settings-card settings-card--wide">
        <template #header>
          <h3>Внешний вид</h3>
        </template>
        <div class="settings-list">
          <div class="settings-field">
            <UFormField label="Акцентный цвет">
              <USelect
                v-model="settings.accentPreset"
                :items="accentOptions"
                value-key="value"
              />
            </UFormField>
          </div>
          <div class="settings-actions">
            <UButton color="neutral" variant="soft" @click="resetToDefaults">
              Сбросить по умолчанию
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </section>
</template>

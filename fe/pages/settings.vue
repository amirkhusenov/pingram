<script lang="ts" setup>
type LastSeenVisibility = "everyone" | "contacts" | "nobody"
type AccentPreset = "lime" | "cyan" | "sunset"

interface AppSettings {
  desktopNotifications: boolean
  soundEffects: boolean
  messagePreview: boolean
  sendOnEnter: boolean
  compactMode: boolean
  readReceipts: boolean
  autoDownloadMedia: boolean
  lastSeenVisibility: LastSeenVisibility
  accentPreset: AccentPreset
}

const STORAGE_KEY = "pingo.settings.v1"

const defaultSettings: AppSettings = {
  desktopNotifications: true,
  soundEffects: true,
  messagePreview: true,
  sendOnEnter: true,
  compactMode: false,
  readReceipts: true,
  autoDownloadMedia: false,
  lastSeenVisibility: "contacts",
  accentPreset: "lime",
}

const settings = reactive<AppSettings>({ ...defaultSettings })
const toast = useToast()

const lastSeenOptions = [
  { label: "Все", value: "everyone" },
  { label: "Только контакты", value: "contacts" },
  { label: "Никто", value: "nobody" },
]

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

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <section class="settings-page">
    <div class="settings-page__header">
      <h1>Настройки</h1>
      <p>Персонализируйте поведение чата и параметры приватности.</p>
    </div>

    <div class="settings-grid">
      <UCard class="settings-card">
        <template #header>
          <h3>Уведомления</h3>
        </template>
        <div class="settings-list">
          <div class="settings-row">
            <div>
              <p>Уведомления на рабочем столе</p>
              <span>Показывать уведомления браузера о новых сообщениях.</span>
            </div>
            <USwitch v-model="settings.desktopNotifications" />
          </div>
          <div class="settings-row">
            <div>
              <p>Звуковые эффекты</p>
              <span>Воспроизводить звук для входящих и исходящих сообщений.</span>
            </div>
            <USwitch v-model="settings.soundEffects" />
          </div>
          <div class="settings-row">
            <div>
              <p>Предпросмотр сообщений</p>
              <span>Показывать текст сообщения в уведомлениях.</span>
            </div>
            <USwitch v-model="settings.messagePreview" />
          </div>
        </div>
      </UCard>

      <UCard class="settings-card">
        <template #header>
          <h3>Приватность</h3>
        </template>
        <div class="settings-list">
          <div class="settings-row">
            <div>
              <p>Отчеты о прочтении</p>
              <span>Разрешить другим видеть, когда вы прочитали сообщение.</span>
            </div>
            <USwitch v-model="settings.readReceipts" />
          </div>
          <div class="settings-field">
            <UFormField label="Видимость «был(а) в сети»">
              <USelect
                v-model="settings.lastSeenVisibility"
                :items="lastSeenOptions"
                value-key="value"
              />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard class="settings-card">
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

<script lang="ts" setup>
type PickerGif = {
  id: string
  url: string
}

type TenorMediaFormat = {
  url?: string
  dims?: number[]
  duration?: number
  size?: number
}

type TenorResultV2 = {
  id: string
  media_formats?: Record<string, TenorMediaFormat>
}

type TenorResponseV2 = {
  results?: TenorResultV2[]
}

type GiphyResponse = {
  data?: Array<{
    id: string
    images?: {
      fixed_height?: { url?: string }
      original?: { url?: string }
    }
  }>
}

const config = useRuntimeConfig()
const tenorApiKey = config.public.TENOR_API_KEY
const tenorApiUrl = config.public.TENOR_API_URL
const giphyApiKey = config.public.GIPHY_API_KEY
const giphyApiUrl = config.public.GIPHY_API_URL

const emit = defineEmits<{ (e: "select", gifUrl: string): void }>()

const searchTerm = ref("")
const gifs = ref<PickerGif[]>([])
const isLoading = ref(false)
const errorText = ref("")

async function fetchFromTenor(): Promise<PickerGif[]> {
  if (!tenorApiKey) return []

  const endpoint = searchTerm.value.trim() ? "search" : "featured"
  const response = await $fetch<TenorResponseV2>(`${tenorApiUrl}/${endpoint}`, {
    params: {
      key: tenorApiKey,
      q: searchTerm.value.trim() || undefined,
      limit: 24,
      locale: "ru_RU",
      contentfilter: "medium",
      media_filter: "tinygif,gif",
    },
  })

  return (response.results ?? [])
    .map((item) => {
      const formats = item.media_formats
      return {
        id: item.id,
        url: formats?.tinygif?.url ?? formats?.gif?.url ?? "",
      }
    })
    .filter((item) => Boolean(item.url))
}

async function fetchFromGiphy(): Promise<PickerGif[]> {
  if (!giphyApiKey) return []

  const endpoint = searchTerm.value.trim() ? "search" : "trending"
  const response = await $fetch<GiphyResponse>(`${giphyApiUrl}/${endpoint}`, {
    params: {
      api_key: giphyApiKey,
      limit: 24,
      q: searchTerm.value.trim() || undefined,
      rating: "pg-13",
      lang: "ru",
    },
  })

  return (response.data ?? [])
    .map((item) => ({
      id: item.id,
      url: item.images?.fixed_height?.url ?? item.images?.original?.url ?? "",
    }))
    .filter((item) => Boolean(item.url))
}

async function fetchGifs() {
  isLoading.value = true
  errorText.value = ""

  try {
    let items = await fetchFromTenor()
    if (items.length === 0) {
      items = await fetchFromGiphy()
    }
    gifs.value = items

    if (items.length === 0 && !tenorApiKey && !giphyApiKey) {
      errorText.value =
        "Добавьте NUXT_PUBLIC_TENOR_API_KEY или NUXT_PUBLIC_GIPHY_API_KEY в .env.local"
    }
  } catch {
    errorText.value = "Не удалось загрузить GIF. Проверьте API-ключ."
  } finally {
    isLoading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchTerm, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(fetchGifs, 250)
})

onMounted(fetchGifs)
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function selectGif(gifUrl: string) {
  emit("select", gifUrl)
}
</script>

<template>
  <UCard :ui="{ body: 'sm:p-2 p-2' }">
    <UInput
      v-model="searchTerm"
      class="w-full mb-3"
      type="text"
      placeholder="Поиск GIF (тренды и хайп)"
    />

    <div v-if="isLoading" class="text-xs text-gray-400 mb-2">Загрузка GIF...</div>
    <div v-else-if="errorText" class="text-xs text-red-300 mb-2">{{ errorText }}</div>

    <div
      class="grid-template grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 overflow-y-auto h-[340px]"
    >
      <button
        v-for="gif in gifs"
        :key="gif.id"
        type="button"
        class="cursor-pointer text-left"
        @click="selectGif(gif.url)"
      >
        <img :src="gif.url" class="w-full h-auto rounded-md" />
      </button>
    </div>
  </UCard>
</template>

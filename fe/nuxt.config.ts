// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  modules: ["@nuxt/ui", "@hebilicious/vue-query-nuxt", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  colorMode: {
    preference: "dark",
    fallback: "dark",
  },
  fonts: {
    families: [
      {
        name: "Space Grotesk",
        provider: "none",
      },
    ],
  },
  icon: {
    provider: "server",
    fallbackToApi: false,
    serverBundle: {
      collections: ["heroicons"],
    },
    clientBundle: {
      scan: true,
    },
  },
  vueQuery: {
    // useState key used by nuxt for the vue query state.
    stateKey: "vue-query-nuxt", // default
    // If you only want to import some functions, specify them here.
    // You can pass false or an empty array to disable this feature.
    // default: ["useQuery", "useQueries", "useInfiniteQuery", "useMutation", "useIsFetching", "useIsMutating", "useQueryClient"]
    autoImports: [
      "useQuery",
      "useQueries",
      "useInfiniteQuery",
      "useMutation",
      "useIsFetching",
      "useIsMutating",
      "useQueryClient",
    ],
    // Pass the vue query client options here ...
    queryClientOptions: {
      defaultOptions: { queries: { staleTime: 5000 } }, // default
    },
    // Pass the vue query plugin options here ....
    vueQueryPluginOptions: {
      enableDevtoolsV6Plugin: true, // enable integrate with the official vue devtools
    },
  },
  runtimeConfig: {
    public: {
      // Defaults for local development. Can be overridden by NUXT_PUBLIC_*.
      API_BASE_URL: "http://localhost:8000/api",
      BACKEND_BASE_URL: "http://localhost:8000",
      TENOR_API_URL: "https://tenor.googleapis.com/v2",
      TENOR_API_KEY: "",
      GIPHY_API_URL: "https://api.giphy.com/v1/gifs",
      GIPHY_API_KEY: "",
    },
  },
})

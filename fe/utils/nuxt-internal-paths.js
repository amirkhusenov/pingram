import { joinRelativeURL } from "ufo"

function getAppConfig() {
  return {
    baseURL: process.env.NUXT_APP_BASE_URL || "/",
    buildAssetsDir: process.env.NUXT_APP_BUILD_ASSETS_DIR || "/_nuxt/",
    cdnURL: process.env.NUXT_APP_CDN_URL || "",
  }
}

export function baseURL() {
  return getAppConfig().baseURL
}

export function buildAssetsDir() {
  return getAppConfig().buildAssetsDir
}

export function buildAssetsURL(...path) {
  return joinRelativeURL(publicAssetsURL(), buildAssetsDir(), ...path)
}

export function publicAssetsURL(...path) {
  const app = getAppConfig()
  const publicBase = app.cdnURL || app.baseURL
  return path.length ? joinRelativeURL(publicBase, ...path) : publicBase
}

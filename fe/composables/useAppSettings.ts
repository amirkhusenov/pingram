type AccentPreset = "lime" | "cyan" | "sunset"
type ThemeMode = "dark" | "light"

const STORAGE_KEY = "pingo.settings.v1"

const accentMap: Record<AccentPreset, { color: string; rgb: string; uiColor: string }> = {
  lime: { color: "#e2f56b", rgb: "226, 245, 107", uiColor: "lime" },
  cyan: { color: "#5ee7ff", rgb: "94, 231, 255", uiColor: "cyan" },
  sunset: { color: "#ffb86b", rgb: "255, 184, 107", uiColor: "amber" },
}

export function useAppSettings() {
  if (!import.meta.client) return

  const colorMode = useColorMode()
  const appConfig = useAppConfig()

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as { accentPreset?: AccentPreset; themeMode?: ThemeMode }

    if (parsed.accentPreset && accentMap[parsed.accentPreset]) {
      const { color, rgb, uiColor } = accentMap[parsed.accentPreset]
      document.documentElement.style.setProperty("--accent", color)
      document.documentElement.style.setProperty("--accent-rgb", rgb)
      appConfig.ui.colors.primary = uiColor
    }

    if (parsed.themeMode) {
      colorMode.preference = parsed.themeMode
    }
  } catch {}
}

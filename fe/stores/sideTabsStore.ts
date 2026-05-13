import { defineStore } from "pinia"

export const useSideTabsStore = defineStore("sidebarStore", {
  state: () => ({
    activeTabIndex: "0",
    activeFolder: "all" as "all" | "archived" | "blocked",
  }),
  actions: {
    setActiveTabIndex(index: string) {
      this.activeTabIndex = index
    },
    setActiveFolder(folder: typeof this.activeFolder) {
      this.activeFolder = folder
    },
  },
})

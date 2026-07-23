'use client'

import { ThemeProvider } from "@/components/theme-provider"
import useSettingStore from "@/stores/setting"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyThemeColors } from "@/lib/theme-utils"
import { applyAppFontFamily } from "@/lib/font-settings"
import { initAllDatabases } from "@/db"
import dayjs from "dayjs"
import zh from "dayjs/locale/zh-cn";
import en from "dayjs/locale/en";
import { useI18n } from "@/hooks/useI18n"
import useVectorStore from "@/stores/vector"
import { AppFootbar } from "@/components/app-footbar"
import { TooltipProvider } from "@/components/ui/tooltip";
import './mobile-styles.css'
import useImageStore from "@/stores/imageHosting";
import { initMcp } from "@/lib/mcp/init"
import { reportAppStart } from "@/lib/event-report"
import { MobileStatusBar } from "@/components/mobile-statusbar"
import { TextSizeProvider } from "@/contexts/text-size-context"
import { SyncConfirmDialog } from "@/components/sync-confirm-dialog"
import { AutoDataSyncConflictDialog } from "@/components/auto-data-sync-conflict-dialog"
import { MobileViewport } from "@/components/mobile-viewport"
import { ControlText } from "@/app/core/main/mark/control-text"
import { ControlRecording } from "@/app/core/main/mark/control-recording"
import { ControlImage } from "@/app/core/main/mark/control-image"
import { ControlLink } from "@/app/core/main/mark/control-link"
import { ControlFile } from "@/app/core/main/mark/control-file"
import { ControlTodo } from "@/app/core/main/mark/control-todo"
import { initAutoDataSyncRuntime } from "@/lib/sync/auto-data-sync-queue"
import useArticleStore from "@/stores/article"
import { WritingScreen } from "./writing/writing-screen"
import { MobileUpdateChecker } from "./components/mobile-update-prompt"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname()
  const isWritingRoute = pathname === '/mobile/writing'
  const [hasWritingCache, setHasWritingCache] = useState(isWritingRoute)
  const { initSettingData, customThemeColors, appFontFamily } = useSettingStore()
  const { initMainHosting } = useImageStore()
  const { initCollapsibleList } = useArticleStore()
  const { initVectorDb } = useVectorStore()
  const { currentLocale } = useI18n()
  useEffect(() => {
    if (isWritingRoute) {
      setHasWritingCache(true)
    }
  }, [isWritingRoute])

  useEffect(() => {
    if (isWritingRoute) {
      return
    }

    const writingRoot = document.getElementById('mobile-writing')
    const activeElement = document.activeElement
    if (writingRoot && activeElement instanceof HTMLElement && writingRoot.contains(activeElement)) {
      activeElement.blur()
    }
  }, [isWritingRoute])

  useEffect(() => {
    let cancelled = false

    void reportAppStart()

    const initializeApp = async () => {
      try {
        await initSettingData()
        initMainHosting()
        await initAllDatabases()
        if (cancelled) return
        await initCollapsibleList()
        if (cancelled) return
        await initAutoDataSyncRuntime()
        if (cancelled) return
        await initVectorDb()
        if (cancelled) return
        await useArticleStore.getState().initVectorIndexedFiles()
        if (cancelled) return
        initMcp()
      } catch (error) {
        console.error('Failed to initialize mobile app:', error)
      }
    }

    void initializeApp()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    switch (currentLocale) {
      case 'zh':
        dayjs.locale(zh);
        break;
      case 'en':
        dayjs.locale(en);
        break;
      default:
        break;
    }
  }, [currentLocale])

  // 应用自定义主题颜色
  useEffect(() => {
    applyThemeColors(customThemeColors)
  }, [customThemeColors])

  // 应用字体
  useEffect(() => {
    applyAppFontFamily(appFontFamily)
  }, [appFontFamily])

  const hideFootbar = pathname.startsWith('/mobile/setting/pages') || pathname === '/mobile/record/detail'

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TextSizeProvider>
        <MobileViewport />
        <MobileStatusBar />
        <TooltipProvider>
          <div className="mobile-app-shell flex flex-col">
            <main className="mobile-app-main flex flex-1 w-full overflow-hidden">
              {hasWritingCache ? (
                <div
                  className={isWritingRoute ? "h-full w-full min-w-0" : "hidden"}
                  aria-hidden={!isWritingRoute}
                >
                  <WritingScreen />
                </div>
              ) : null}
              {!isWritingRoute ? children : null}
            </main>
            {!hideFootbar ? (
              <div className="mobile-footbar">
                <AppFootbar />
              </div>
            ) : null}
          </div>
          {/* 隐藏的记录工具组件，用于监听事件 */}
          <div className="absolute opacity-0 pointer-events-none -z-50">
            <ControlText />
            <ControlRecording />
            <ControlImage />
            <ControlLink />
            <ControlFile />
            <ControlTodo />
          </div>
        </TooltipProvider>
        <SyncConfirmDialog />
        <AutoDataSyncConflictDialog />
        <MobileUpdateChecker />
      </TextSizeProvider>
    </ThemeProvider>
  );
}

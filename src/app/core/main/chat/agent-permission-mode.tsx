"use client"

import { Eye, ShieldCheck, ShieldQuestion } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AgentPermissionMode } from "@/lib/agent/types"
import { canvasEditingSession } from "@/lib/canvas/ai-permission"
import useChatStore from "@/stores/chat"
import useSettingStore from "@/stores/setting"

const MODE_ICONS = {
  "read-only": Eye,
  ask: ShieldQuestion,
  "auto-edit": ShieldCheck,
} satisfies Record<AgentPermissionMode, typeof Eye>

export function AgentPermissionModeSelect() {
  const t = useTranslations("record.chat.input.agent.permissionMode")
  const { agentPermissionMode, setAgentPermissionMode } = useSettingStore()
  const loading = useChatStore((state) => state.loading)
  const editingSessionActive = useSyncExternalStore(
    canvasEditingSession.subscribe,
    () => canvasEditingSession.isActive(),
    () => false,
  )
  const effectiveMode = agentPermissionMode === "auto-edit" && !editingSessionActive
    ? "ask"
    : agentPermissionMode
  const Icon = MODE_ICONS[effectiveMode]

  useEffect(() => {
    if (agentPermissionMode === "auto-edit" && !editingSessionActive) {
      void setAgentPermissionMode("ask")
    }
  }, [agentPermissionMode, editingSessionActive, setAgentPermissionMode])

  const handleChange = (value: string) => {
    if (value === "read-only" || value === "ask" || value === "auto-edit") {
      if (value === "auto-edit") canvasEditingSession.grant()
      else canvasEditingSession.revoke()
      void setAgentPermissionMode(value)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={loading}
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          aria-label={t("label")}
        >
          <Icon className="size-4" />
          <span className="hidden md:inline">{t(`modes.${effectiveMode}.title`)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={effectiveMode} onValueChange={handleChange}>
          {(["read-only", "ask", "auto-edit"] as const).map((mode) => {
            const ModeIcon = MODE_ICONS[mode]
            return (
              <DropdownMenuRadioItem key={mode} value={mode} className="items-start gap-2 py-2">
                <ModeIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="block text-sm">{t(`modes.${mode}.title`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`modes.${mode}.description`)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client'

import { Button } from "@/components/ui/button"
import { FolderOpen, ChevronDown, FolderPlus } from "lucide-react"
import useSettingStore from "@/stores/setting"
import useArticleStore from "@/stores/article"
import { useSkillsStore } from "@/stores/skills"
import { useTranslations } from 'next-intl'
import { useMemo } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { getWorkspaceDisplayName } from "@/lib/workspace-name"

export function FileFooter() {
  const { workspacePath, workspaceHistory, setWorkspacePath } = useSettingStore()
  const { refreshSkills } = useSkillsStore()
  const {
    clearCollapsibleList,
    loadFileTree,
    setActiveFilePath,
    setCurrentArticle
  } = useArticleStore()
  const tFile = useTranslations('settings.file')

  // 当前工作区名称
  const currentWorkspaceName = useMemo(() => {
    return getWorkspaceDisplayName(workspacePath, tFile('workspace.defaultPath'))
  }, [workspacePath, tFile])

  // 选择工作区目录
  async function handleSelectWorkspace() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: tFile('workspace.select')
      })
      
      if (selected) {
        const path = selected as string
        await switchWorkspace(path)
      }
    } catch (error) {
      console.error('选择工作区失败:', error)
    }
  }

  // 切换工作区
  async function switchWorkspace(path: string) {
    if (path === workspacePath) return

    try {
      await setWorkspacePath(path)
      await clearCollapsibleList()
      setActiveFilePath('')
      setCurrentArticle('')
      await loadFileTree()
      await refreshSkills()
    } catch (error) {
      console.error('切换工作区失败:', error)
    }
  }

  // 重置为默认工作区
  async function handleResetWorkspace() {
    try {
      await setWorkspacePath('')
      await clearCollapsibleList()
      setActiveFilePath('')
      setCurrentArticle('')
      await loadFileTree()
      await refreshSkills()
    } catch (error) {
      console.error('重置工作区失败:', error)
    }
  }

  return (
    <div className="flex h-6 shrink-0 items-center justify-between gap-1 overflow-hidden border-t border-border bg-background px-2 text-xs text-muted-foreground">
      {/* 左侧：工作区选择器 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-5 flex-1 justify-between border-0 bg-transparent px-1.5 text-xs text-muted-foreground hover:bg-accent focus-visible:border-transparent focus-visible:ring-0"
          >
            <span className="truncate text-xs">{currentWorkspaceName}</span>
            <ChevronDown className="ml-1 size-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {/* 选择新工作区 */}
          <DropdownMenuLabel>{tFile('workspace.actions')}</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleSelectWorkspace}>
            <FolderPlus className="mr-2 h-4 w-4" />
            {tFile('workspace.select')}
          </DropdownMenuItem>
          {workspacePath && (
            <DropdownMenuItem onClick={handleResetWorkspace}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {tFile('workspace.defaultPath')}
            </DropdownMenuItem>
          )}
          
          {/* 历史工作区 */}
          {workspaceHistory.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{tFile('workspace.history')}</DropdownMenuLabel>
              {workspaceHistory.map((path, index) => (
              <DropdownMenuItem key={index} onClick={() => switchWorkspace(path)}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span className="truncate" title={path}>
                    {getWorkspaceDisplayName(path, tFile('workspace.defaultPath'))}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          {/* 默认工作区 */}
          {!workspacePath && workspaceHistory.length === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <FolderOpen className="mr-2 h-4 w-4" />
                {tFile('workspace.defaultPath')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

    </div>
  )
}

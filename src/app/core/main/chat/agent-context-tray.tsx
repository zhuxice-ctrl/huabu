"use client"

import * as React from "react"
import {
  ChevronRight,
  Database,
  FileText,
  MoreHorizontal,
  Sparkles,
} from "lucide-react"
import useArticleStore from "@/stores/article"
import type { AgentSkillSummary } from "@/lib/agent/types"
import { cn } from "@/lib/utils"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"

export interface RagSourceDetail {
  filepath: string
  filename: string
  content: string
}

interface AgentContextTrayProps {
  ragSources?: string[]
  ragSourceDetails?: RagSourceDetail[]
  loadedSkills?: AgentSkillSummary[]
}

export function AgentContextTray({
  ragSources = [],
  ragSourceDetails = [],
  loadedSkills = [],
}: AgentContextTrayProps) {
  const [showRag, setShowRag] = React.useState(false)
  const [showSkills, setShowSkills] = React.useState(false)
  const [expandedSkillDescriptions, setExpandedSkillDescriptions] = React.useState<string[]>([])
  const { setActiveFilePath, readArticle } = useArticleStore()

  const detailMap = React.useMemo(
    () => new Map(ragSourceDetails.map((detail) => [detail.filename, detail])),
    [ragSourceDetails]
  )

  const openRagFile = (filepath: string) => {
    if (!filepath) return
    setActiveFilePath(filepath)
    void readArticle(filepath)
  }

  const toggleSkillDescription = (skillId: string) => {
    setExpandedSkillDescriptions((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId]
    )
  }

  if (ragSources.length === 0 && loadedSkills.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      {ragSources.length > 0 && (
        <div>
          <Marker asChild>
            <button
              type="button"
              className="group py-1.5 transition-colors hover:text-foreground"
              onClick={() => setShowRag((value) => !value)}
            >
              <MarkerIcon><Database /></MarkerIcon>
              <MarkerContent className="flex-1 truncate">已检索 {ragSources.length} 个文件</MarkerContent>
              <MarkerIcon>
                <ChevronRight className={cn("transition-transform", showRag && "rotate-90")} />
              </MarkerIcon>
            </button>
          </Marker>

          {showRag && (
            <div className="flex flex-col gap-1 pl-6">
              {ragSources.map((source) => {
                const detail = detailMap.get(source)
                return (
                  <div key={source} className="flex flex-col gap-1 py-1 text-xs">
                    <Marker>
                      <MarkerIcon><FileText /></MarkerIcon>
                      <MarkerContent className="flex-1 truncate">{source}</MarkerContent>
                      {detail?.filepath && (
                        <button
                          type="button"
                          className="shrink-0 text-primary hover:underline"
                          onClick={() => openRagFile(detail.filepath)}
                        >
                          打开
                        </button>
                      )}
                    </Marker>
                    {detail?.content && (
                      <div className="truncate pl-6 text-muted-foreground">
                        {detail.content}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {loadedSkills.length > 0 && (
        <div>
          <Marker asChild>
            <button
              type="button"
              className="group py-1.5 transition-colors hover:text-foreground"
              onClick={() => setShowSkills((value) => !value)}
            >
              <MarkerIcon><Sparkles /></MarkerIcon>
              <MarkerContent className="flex-1 truncate">
                已使用 {loadedSkills.length} 个技能
              </MarkerContent>
              <MarkerIcon>
                <ChevronRight className={cn("transition-transform", showSkills && "rotate-90")} />
              </MarkerIcon>
            </button>
          </Marker>

          {showSkills && (
            <div className="flex flex-col gap-2 pl-6">
              {loadedSkills.map((skill) => {
                const descriptionExpanded = expandedSkillDescriptions.includes(skill.id)

                return (
                  <div key={skill.id} className="flex flex-col gap-0.5 py-1 text-xs">
                    <Marker>
                      <MarkerIcon><Sparkles /></MarkerIcon>
                      <MarkerContent className="truncate font-medium text-foreground">{skill.name}</MarkerContent>
                    </Marker>
                    <div className="truncate pl-6 text-muted-foreground">
                      {skill.id}
                    </div>
                    {skill.description && (
                      <div className="flex min-w-0 items-start gap-1 pl-6 text-muted-foreground">
                        <div
                          className={cn(
                            "min-w-0 flex-1",
                            descriptionExpanded ? "whitespace-pre-wrap break-words" : "truncate"
                          )}
                        >
                          {skill.description}
                        </div>
                        <button
                          type="button"
                          className="mt-0.5 shrink-0 rounded px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => toggleSkillDescription(skill.id)}
                          title={descriptionExpanded ? "收起描述" : "展开描述"}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

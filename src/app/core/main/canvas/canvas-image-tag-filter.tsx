'use client'

import { useMemo, useState } from 'react'
import { Tags } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { normalizeImageTags } from '@/lib/canvas/image-tags'

interface CanvasImageTagFilterProps {
  catalog: string[]
  selectedTags: string[]
  matchIndex: number
  matchCount: number
  onToggleTag: (tag: string) => void
  onPrevious: () => void
  onNext: () => void
  onClear: () => void
}

export function CanvasImageTagFilter({
  catalog,
  selectedTags,
  matchIndex,
  matchCount,
  onToggleTag,
  onPrevious,
  onNext,
  onClear,
}: CanvasImageTagFilterProps) {
  const [query, setQuery] = useState('')
  const selectedKeys = useMemo(
    () => new Set(normalizeImageTags(selectedTags).map(tag => tag.toLocaleLowerCase())),
    [selectedTags],
  )
  const visibleTags = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return normalizeImageTags(catalog).filter(tag => (
      !normalizedQuery || tag.toLocaleLowerCase().includes(normalizedQuery)
    ))
  }, [catalog, query])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={selectedTags.length ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label="图片标签筛选"
        >
          <Tags />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-sm font-medium">图片标签</div>
            <div className="text-xs text-muted-foreground">多选标签使用 OR 匹配当前画布。</div>
          </div>
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标签" />
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
          )}
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {visibleTags.length > 0 ? visibleTags.map(tag => (
              <Button
                key={tag}
                type="button"
                variant={selectedKeys.has(tag.toLocaleLowerCase()) ? 'default' : 'outline'}
                size="xs"
                aria-pressed={selectedKeys.has(tag.toLocaleLowerCase())}
                onClick={() => onToggleTag(tag)}
              >
                {tag}
              </Button>
            )) : <span className="text-xs text-muted-foreground">没有匹配标签</span>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">
              {matchCount ? `${matchIndex + 1} / ${matchCount}` : '0 / 0'}
            </span>
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" disabled={!matchCount} onClick={onPrevious}>上一个</Button>
              <Button type="button" variant="outline" size="sm" disabled={!matchCount} onClick={onNext}>下一个</Button>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={!selectedTags.length} onClick={onClear}>清除筛选</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

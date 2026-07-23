"use client"

import { useState } from 'react'
import { Database, DatabaseZap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TooltipButton } from '@/components/tooltip-button'
import useVectorStore from '@/stores/vector'
import { checkEmbeddingModelAvailable } from '@/lib/rag'
import { toast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item'

interface RagSwitchProps {
  display?: 'icon' | 'panel'
}

export function RagSwitch({ display = 'icon' }: RagSwitchProps) {
  const { isRagEnabled, setRagEnabled } = useVectorStore()
  const t = useTranslations('record.chat.input')
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (isRagEnabled) {
      await setRagEnabled(false)
    } else {
      setLoading(true)
      const embeddingModelAvailable = await checkEmbeddingModelAvailable()
      setLoading(false)
      if (!embeddingModelAvailable) {
        toast({
          variant: "destructive",
          description: t('rag.notSupported')
        })
        return
      }
      await setRagEnabled(true)
    }
  }

  if (display === 'panel') {
    return (
      <Item size="sm" className="h-12 flex-nowrap py-0 hover:bg-muted">
        <ItemMedia variant="icon">
          {isRagEnabled ? <DatabaseZap /> : <Database />}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>{isRagEnabled ? t('rag.enabled') : t('rag.disabled')}</ItemTitle>
        </ItemContent>
        <ItemActions className="shrink-0">
          <Switch
            checked={isRagEnabled}
            disabled={loading}
            aria-label={isRagEnabled ? t('rag.enabled') : t('rag.disabled')}
            onCheckedChange={() => void handleToggle()}
          />
        </ItemActions>
      </Item>
    )
  }

  return (
    <div>
      <TooltipButton
        icon={isRagEnabled ? <DatabaseZap className="size-4" /> : <Database className="size-4" />}
        tooltipText={isRagEnabled ? t('rag.enabled') : t('rag.disabled')}
        size="icon"
        side="bottom"
        onClick={handleToggle}
        disabled={loading}
        variant="ghost"
      />
    </div>
  )
}

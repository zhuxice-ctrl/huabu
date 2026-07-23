'use client'

import { EmitterRecordEvents } from '@/config/emitters'
import { toast } from '@/hooks/use-toast'
import emitter from '@/lib/emitter'
import { handleRecordComplete } from '@/lib/record-navigation'
import useMarkStore from '@/stores/mark'
import useTagStore from '@/stores/tag'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

interface CompleteRecordOptions {
  markId?: number | null
  tagId?: number | null
  typeLabel?: string
}

export function useRecordCompletion() {
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations()
  const { fetchMarks, fetchMarkPreviews, setPendingScrollMarkId, setHighlightedMarkId } = useMarkStore()
  const { fetchTags, getCurrentTag, setCurrentTagId } = useTagStore()

  const openSavedRecord = useCallback(async (markId?: number | null, tagId?: number | null) => {
    if (tagId) {
      await setCurrentTagId(tagId)
    }

    await fetchTags()
    getCurrentTag()
    if (pathname.startsWith('/mobile')) {
      await fetchMarkPreviews()
    } else {
      await fetchMarks()
    }
    emitter.emit(EmitterRecordEvents.refreshMarks)
    handleRecordComplete(router)

    if (markId) {
      setPendingScrollMarkId(markId)
      setHighlightedMarkId(markId)
    }
  }, [fetchMarkPreviews, fetchMarks, fetchTags, getCurrentTag, pathname, router, setCurrentTagId, setHighlightedMarkId, setPendingScrollMarkId])

  return useCallback(async ({ markId, tagId, typeLabel }: CompleteRecordOptions = {}) => {
    await openSavedRecord(markId, tagId)
    
    const tagName = tagId
      ? useTagStore.getState().tags.find((tag) => tag.id === tagId)?.name
      : undefined
    const savedDescription = typeLabel
      ? t('record.capture.savedWithType', { type: typeLabel })
      : undefined

    toast({
      title: t('record.capture.saved'),
      description: tagName
        ? `${savedDescription || t('record.capture.saved')} · ${t('record.capture.saveTarget')}: ${tagName}`
        : savedDescription,
      action: markId ? {
        label: t('record.capture.viewRecord'),
        onClick: () => {
          void openSavedRecord(markId, tagId)
        },
      } : undefined,
    })
  }, [openSavedRecord, t])
}

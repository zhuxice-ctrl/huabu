'use client'

import { confirm } from '@tauri-apps/plugin-dialog'
import { BookOpenCheck, Cloud, Database, DatabaseZap, Download, EllipsisVertical, LoaderCircle, PackageOpen, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/use-toast'
import useArticleStore from '@/stores/article'
import useCloudLibraryStore from '@/stores/cloud-library'
import useVectorStore from '@/stores/vector'
import { cn } from '@/lib/utils'

export function CloudLibraryMenu({ className }: { className?: string }) {
  const t = useTranslations('article.file.cloudLibrary')
  const {
    loadFileTree,
    loadRemoteSyncFiles,
    markFileRemote,
    initVectorIndexedFiles,
    syncStaticAssets,
    initSyncStaticAssets,
    setSyncStaticAssets,
    showCloudFiles,
    initShowCloudFiles,
    setShowCloudFiles,
  } = useArticleStore()
  const { processAllDocuments, isProcessing, isAutoVectorEnabled, setAutoVectorEnabled } = useVectorStore()
  const {
    operation,
    progressCurrent,
    progressTotal,
    progressPath,
    pullAllFiles,
    uploadAllFiles,
    uploadKnowledgeBase,
    downloadKnowledgeBase,
  } = useCloudLibraryStore()
  const busy = operation !== null || isProcessing

  useEffect(() => {
    void initSyncStaticAssets()
    void initShowCloudFiles()
  }, [initShowCloudFiles, initSyncStaticAssets])

  async function handlePullAll() {
    try {
      const result = await pullAllFiles(undefined, { includeStaticAssets: true })
      await loadFileTree()
      toast({
        title: t('pullComplete'),
        description: t('pullResult', {
          downloaded: result.downloaded,
          skipped: result.skipped,
          failed: result.failed.length,
        }),
        variant: result.failed.length > 0 ? 'destructive' : 'default',
      })
    } catch (error) {
      toast({
        title: t('operationFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    }
  }

  async function handleUploadAll() {
    const accepted = await confirm(t(syncStaticAssets ? 'uploadFilesWithAssetsWarning' : 'uploadFilesWarning'), {
      title: t('uploadFiles'),
      kind: 'warning',
    })
    if (!accepted) return

    try {
      const result = await uploadAllFiles(progress => {
        if (progress.phase === 'uploaded' && progress.path && progress.sha) {
          markFileRemote(progress.path, progress.sha)
        }
      }, { includeStaticAssets: syncStaticAssets })
      await loadFileTree({ skipRemoteSync: true })
      await loadRemoteSyncFiles()
      toast({
        title: t('uploadFilesComplete'),
        description: t('uploadFilesResult', {
          uploaded: result.uploaded,
          failed: result.failed.length,
        }),
        variant: result.failed.length > 0 ? 'destructive' : 'default',
      })
    } catch (error) {
      toast({
        title: t('operationFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    }
  }

  async function handleUploadKnowledgeBase() {
    const accepted = await confirm(t('uploadPrivacyWarning'), {
      title: t('uploadKnowledgeBase'),
      kind: 'warning',
    })
    if (!accepted) return

    try {
      const manifest = await uploadKnowledgeBase()
      toast({
        title: t('uploadComplete'),
        description: t('knowledgeResult', {
          documents: manifest.documentCount,
          vectors: manifest.vectorCount,
        }),
      })
    } catch (error) {
      toast({
        title: t('operationFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    }
  }

  async function handleDownloadKnowledgeBase() {
    const accepted = await confirm(t('downloadOverwriteWarning'), {
      title: t('downloadKnowledgeBase'),
      kind: 'warning',
    })
    if (!accepted) return

    try {
      const result = await downloadKnowledgeBase()
      await initVectorIndexedFiles()
      toast({
        title: t('downloadComplete'),
        description: result.missingSourceFiles.length > 0
          ? t('missingSources', { count: result.missingSourceFiles.length })
          : t('knowledgeResult', {
              documents: result.manifest.documentCount,
              vectors: result.manifest.vectorCount,
            }),
      })
    } catch (error) {
      toast({
        title: t('operationFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('relative focus-visible:border-transparent focus-visible:ring-0', className)}
          disabled={busy}
          aria-label={t('title')}
          title={t('title')}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <EllipsisVertical className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t('files')}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void setShowCloudFiles(!showCloudFiles)
          }}
        >
          <Cloud className="mr-2 size-4" />
          <span>{t('showRemoteFiles')}</span>
          <Switch
            className="ml-auto"
            checked={showCloudFiles}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => void setShowCloudFiles(checked)}
            aria-label={t('showRemoteFiles')}
          />
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void setSyncStaticAssets(!syncStaticAssets)
          }}
        >
          <PackageOpen className="mr-2 size-4" />
          <span>{t('syncStaticAssets')}</span>
          <Switch
            className="ml-auto"
            checked={syncStaticAssets}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => void setSyncStaticAssets(checked)}
            aria-label={t('syncStaticAssets')}
          />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleUploadAll()} disabled={busy}>
          <Upload className="mr-2 size-4" />
          {t('uploadFiles')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handlePullAll()} disabled={busy}>
          <Download className="mr-2 size-4" />
          {t('downloadFiles')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('knowledgeBase')}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void setAutoVectorEnabled(!isAutoVectorEnabled)
          }}
        >
          <DatabaseZap className="mr-2 size-4" />
          <span>{t('autoUpdate')}</span>
          <Switch
            className="ml-auto"
            checked={isAutoVectorEnabled}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => void setAutoVectorEnabled(checked)}
            aria-label={t('autoUpdate')}
          />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void processAllDocuments()} disabled={busy}>
          <Database className="mr-2 size-4" />
          {t('recalculate')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleUploadKnowledgeBase()} disabled={busy}>
          <Upload className="mr-2 size-4" />
          {t('uploadKnowledgeBase')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleDownloadKnowledgeBase()} disabled={busy}>
          <Download className="mr-2 size-4" />
          {t('downloadKnowledgeBase')}
        </DropdownMenuItem>

        {operation && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="size-3.5 shrink-0" />
                <span>{t(`operations.${operation}`)} {progressCurrent}/{progressTotal || '—'}</span>
              </div>
              {progressPath && <div className="mt-1 truncate" title={progressPath}>{progressPath}</div>}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

'use client'
import { useTranslations } from 'next-intl';
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

export default function DefaultModelsSection() {
  const t = useTranslations('settings.ai.defaultModels');

  return (
    <Card className="mb-6 border-dashed bg-muted/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
    </Card>
  );
}

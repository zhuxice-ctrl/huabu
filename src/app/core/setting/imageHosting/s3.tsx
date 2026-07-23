'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import useImageStore from '@/stores/imageHosting';
import { SyncStateEnum } from '@/lib/sync/github.types';
import { testS3Connection } from '@/lib/imageHosting/s3';
import { Store } from '@tauri-apps/plugin-store';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item';

interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  endpoint?: string
  customDomain?: string
  pathPrefix?: string
}

export function S3ImageHosting() {
  const t = useTranslations();
  const { setS3Config, s3State, setS3State } = useImageStore();
  
  const [config, setConfig] = useState<S3Config>({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    bucket: '',
    endpoint: '',
    customDomain: '',
    pathPrefix: ''
  });
  
  const [showSecretKey, setShowSecretKey] = useState(false);

  // 初始化配置
  useEffect(() => {
    const initConfig = async () => {
      const store = await Store.load('store.json');
      const savedConfig = await store.get<S3Config>('s3Config');
      if (savedConfig) {
        setConfig(savedConfig);
        // 如果配置完整，自动进行连接检测
        if (savedConfig.accessKeyId && savedConfig.secretAccessKey && savedConfig.region && savedConfig.bucket) {
          setS3State(SyncStateEnum.checking);
          try {
            const isConnected = await testS3Connection(savedConfig);
            if (isConnected) {
              setS3State(SyncStateEnum.success);
            } else {
              setS3State(SyncStateEnum.fail);
            }
          } catch (error) {
            setS3State(SyncStateEnum.fail);
            console.error('S3 connection test failed:', error);
          }
        }
      }
    };
    initConfig();
  }, [setS3Config]);

  // 自动保存和测试配置
  const handleConfigChange = async (newConfig: S3Config) => {
    setConfig(newConfig);
    
    // 自动保存配置
    try {
      await setS3Config(newConfig);
    } catch (error) {
      console.error('Failed to save S3 config:', error);
    }
    
    // 如果必填字段都已填写，自动测试连接
    if (newConfig.accessKeyId && newConfig.secretAccessKey && newConfig.region && newConfig.bucket) {
      setS3State(SyncStateEnum.checking);

      try {
        const isConnected = await testS3Connection(newConfig);
        if (isConnected) {
          setS3State(SyncStateEnum.success);
        } else {
          setS3State(SyncStateEnum.fail);
        }
      } catch (error) {
        setS3State(SyncStateEnum.fail);
        console.error('S3 connection test failed:', error);
      }
    } else {
      setS3State(SyncStateEnum.fail);
    }
  };

  const getStatusIcon = () => {
    switch (s3State) {
      case SyncStateEnum.success:
        return <CheckCircle className="size-4 text-green-500" />;
      case SyncStateEnum.checking:
        return <Loader2 className="size-4 animate-spin text-blue-500" />;
      case SyncStateEnum.fail:
      default:
        return <XCircle className="size-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (s3State) {
      case SyncStateEnum.success:
        return t('settings.imageHosting.s3.connected');
      case SyncStateEnum.checking:
        return t('settings.imageHosting.s3.connecting');
      case SyncStateEnum.fail:
      default:
        return t('settings.imageHosting.s3.disconnected');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.imageHosting.s3.title')}</CardTitle>
        <CardDescription>{t('settings.imageHosting.s3.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>{t('settings.imageHosting.s3.status')}</ItemTitle>
            </ItemContent>
            <ItemActions>
              {getStatusIcon()}
              <span className="text-sm">{getStatusText()}</span>
            </ItemActions>
          </Item>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="accessKeyId">{t('settings.imageHosting.s3.accessKeyId')}</FieldLabel>
              <Input
                id="accessKeyId"
                type="text"
                value={config.accessKeyId}
                onChange={(e) => handleConfigChange({ ...config, accessKeyId: e.target.value })}
                placeholder={t('settings.imageHosting.s3.accessKeyIdPlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="secretAccessKey">{t('settings.imageHosting.s3.secretAccessKey')}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="secretAccessKey"
                  type={showSecretKey ? "text" : "password"}
                  value={config.secretAccessKey}
                  onChange={(e) => handleConfigChange({ ...config, secretAccessKey: e.target.value })}
                  placeholder={t('settings.imageHosting.s3.secretAccessKeyPlaceholder')}
                />
                <InputGroupButton
                  size="icon-xs"
                  aria-label={showSecretKey ? 'Hide secret key' : 'Show secret key'}
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </InputGroupButton>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="region">{t('settings.imageHosting.s3.region')}</FieldLabel>
              <Input id="region" value={config.region} onChange={(e) => handleConfigChange({ ...config, region: e.target.value })} placeholder="us-east-1" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bucket">{t('settings.imageHosting.s3.bucket')}</FieldLabel>
              <Input id="bucket" value={config.bucket} onChange={(e) => handleConfigChange({ ...config, bucket: e.target.value })} placeholder={t('settings.imageHosting.s3.bucketPlaceholder')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="endpoint">{t('settings.imageHosting.s3.endpoint')}</FieldLabel>
              <Input id="endpoint" value={config.endpoint || ''} onChange={(e) => handleConfigChange({ ...config, endpoint: e.target.value })} placeholder="https://s3.amazonaws.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="customDomain">{t('settings.imageHosting.s3.customDomain')}</FieldLabel>
              <Input id="customDomain" value={config.customDomain || ''} onChange={(e) => handleConfigChange({ ...config, customDomain: e.target.value })} placeholder="https://cdn.example.com" />
            </Field>
            <Field>
              <FieldLabel htmlFor="pathPrefix">{t('settings.imageHosting.s3.pathPrefix')}</FieldLabel>
              <Input id="pathPrefix" value={config.pathPrefix || ''} onChange={(e) => handleConfigChange({ ...config, pathPrefix: e.target.value })} placeholder="images/" />
              <FieldDescription>{t('settings.imageHosting.s3.pathPrefixDesc')}</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

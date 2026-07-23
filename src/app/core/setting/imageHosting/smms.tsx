import { Eye, EyeOff, LoaderCircle, CheckCircle, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { type SMMSImageHostingSetting } from "@/lib/imageHosting/smms";
import useImageStore from "@/stores/imageHosting";
import { getUserInfo } from "@/lib/imageHosting/smms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenBroswer } from "@/components/open-broswer";
import { useTranslations } from "next-intl";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";

const CREATE_TOKEN_URL = 'https://s.ee/user/developers'

export default function SMMSImageHosting() {
  const t = useTranslations('settings.imageHosting.smms')
  useImageStore()

  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')
  const [tokenVisible, setTokenVisible] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  async function init() {
    const store = await Store.load('store.json');
    const imageHostings = await store.get<SMMSImageHostingSetting>('smms')
    if (imageHostings) {
      setToken(imageHostings.token)
    }
  }

  // 设置 token
  async function handleSetToken(token: string) {
    setToken(token)
    const store = await Store.load('store.json');
    await store.set('smms', { token })
    await store.save()
  }

  // 获取用户信息
  async function handleSetUserInfo() {
    setLoading(true)
    setIsConnected(false)
    const user = await getUserInfo()
    setIsConnected(!!user)
    setLoading(false)
  }

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    handleSetUserInfo()
  }, [token])

  const getStatusIcon = () => {
    if (loading) {
      return <LoaderCircle className="size-4 animate-spin text-blue-500" />;
    }
    if (token && isConnected) {
      return <CheckCircle className="size-4 text-green-500" />;
    }
    if (token && !isConnected) {
      return <XCircle className="size-4 text-red-500" />;
    }
    return <XCircle className="size-4 text-gray-500" />;
  };

  const getStatusText = () => {
    if (loading) {
      return t('connecting');
    }
    if (token && isConnected) {
      return t('connected');
    }
    if (token && !isConnected) {
      return t('disconnected');
    }
    return t('disconnected');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>{t('status')}</ItemTitle>
            </ItemContent>
            <ItemActions>
              {getStatusIcon()}
              <span className="text-sm">{getStatusText()}</span>
            </ItemActions>
          </Item>

          <Field>
            <FieldLabel htmlFor="smms-api-token">API Token</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="smms-api-token"
                type={tokenVisible ? 'text' : 'password'}
                value={token}
                onChange={(e) => handleSetToken(e.target.value)}
                placeholder={t('token.placeholder')}
              />
              <InputGroupButton
                size="icon-xs"
                aria-label={tokenVisible ? 'Hide token' : 'Show token'}
                onClick={() => setTokenVisible(!tokenVisible)}
              >
                {tokenVisible ? <Eye /> : <EyeOff />}
              </InputGroupButton>
            </InputGroup>
            <FieldDescription>{t('token.helper')}</FieldDescription>
            <OpenBroswer url={CREATE_TOKEN_URL} title={t('token.createToken')} className="w-fit text-sm" />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

/**
 * Configuração das mensagens do WhatsApp: saudação/despedida e o template que reabre a janela de
 * 24h.
 *
 * Os formulários vêm do @adatechnology/conversations-ui e são puramente apresentacionais — quem
 * persiste é esta tela. A aba de transcrição de áudio do SDK não é usada: não há engine de
 * transcrição neste deploy, e um interruptor que não transcreve nada é pior que a ausência dele.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  WelcomeFarewellForm,
  WhatsAppTemplatesSettings,
  type WhatsAppCreateTemplateResult,
  type WhatsAppCreateTemplateState,
} from '@adatechnology/conversations-ui'
import {
  createWhatsAppTemplate,
  fetchWhatsAppSettings,
  fetchWhatsAppTemplates,
  saveWhatsAppSettings,
  type WhatsAppSettings,
} from '@/lib/whatsappSettingsApi'

const TAB = {
  GREETINGS: 'greetings',
  TEMPLATES: 'templates',
} as const

type MessagesTab = (typeof TAB)[keyof typeof TAB]

const TABS: readonly { key: MessagesTab; label: string }[] = [
  { key: TAB.GREETINGS, label: 'Saudação e despedida' },
  { key: TAB.TEMPLATES, label: 'Templates' },
]

const SETTINGS_QUERY_KEY = ['whatsapp', 'settings'] as const
const TEMPLATES_QUERY_KEY = ['whatsapp', 'templates'] as const

const DEFAULT_LANGUAGE = 'pt_BR'

const WELCOME_PLACEHOLDERS = ['{{nome}}', '{{estabelecimento}}'] as const

const EMPTY_TEMPLATE_DRAFT: WhatsAppCreateTemplateState = {
  name: '',
  category: 'UTILITY',
  language: DEFAULT_LANGUAGE,
  headerType: 'NONE',
  headerText: '',
  bodyText: '',
  footerText: '',
}

export function MessagesPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<MessagesTab>(TAB.GREETINGS)

  const settingsQuery = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: fetchWhatsAppSettings })
  const templatesQuery = useQuery({
    queryKey: TEMPLATES_QUERY_KEY,
    queryFn: fetchWhatsAppTemplates,
    enabled: tab === TAB.TEMPLATES,
  })

  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [farewellMessage, setFarewellMessage] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateLanguage, setTemplateLanguage] = useState(DEFAULT_LANGUAGE)
  const [templateVariables, setTemplateVariables] = useState<string[]>([])
  const [draft, setDraft] = useState<WhatsAppCreateTemplateState>(EMPTY_TEMPLATE_DRAFT)
  const [createResult, setCreateResult] = useState<WhatsAppCreateTemplateResult | null>(null)

  // Sincroniza o formulário com o servidor: o estado dos campos é local porque o usuário digita
  // antes de salvar, e derivar da query descartaria o que ele escreveu a cada refetch.
  const loaded = settingsQuery.data
  useEffect(() => {
    if (!loaded) return
    setWelcomeMessage(loaded.welcomeMessage)
    setFarewellMessage(loaded.farewellMessage)
    setTemplateName(loaded.templateName)
    setTemplateLanguage(loaded.templateLanguage)
    setTemplateVariables(loaded.templateVariables)
  }, [loaded])

  const saveMutation = useMutation({
    mutationFn: (update: Partial<WhatsAppSettings>) => saveWhatsAppSettings(update),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_QUERY_KEY, saved),
  })

  const createMutation = useMutation({
    mutationFn: createWhatsAppTemplate,
    onSuccess: async (result) => {
      setCreateResult({
        ok: true,
        message: `Template enviado para aprovação da Meta (${result.shortId}).`,
        status: result.status,
      })
      setDraft(EMPTY_TEMPLATE_DRAFT)
      await queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY })
    },
    onError: (error: Error) => setCreateResult({ ok: false, message: error.message }),
  })

  function handleSaveGreetings(event: FormEvent) {
    event.preventDefault()
    saveMutation.mutate({ welcomeMessage, farewellMessage })
  }

  function handleSaveTemplate(event: FormEvent) {
    event.preventDefault()
    saveMutation.mutate({ templateName, templateLanguage, templateVariables })
  }

  function handleSelectTemplate(name: string, template: { language: string } | undefined) {
    setTemplateName(name)
    if (template) setTemplateLanguage(template.language)
  }

  function handleCreateTemplate(event: FormEvent) {
    event.preventDefault()
    setCreateResult(null)
    createMutation.mutate({
      name: draft.name,
      category: draft.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
      language: draft.language,
      headerType: draft.headerType,
      ...(draft.headerType === 'TEXT' && draft.headerText ? { headerText: draft.headerText } : {}),
      bodyText: draft.bodyText,
      ...(draft.footerText ? { footerText: draft.footerText } : {}),
    })
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Mensagens</h1>
        <p className="text-sm text-muted-foreground">
          Textos automáticos do atendimento e templates aprovados pela Meta.
        </p>
      </header>

      <nav className="flex gap-2 border-b">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={
              item.key === tab
                ? 'border-b-2 border-primary px-4 py-2 text-sm font-medium'
                : 'px-4 py-2 text-sm text-muted-foreground'
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      {settingsQuery.isLoading ? <p className="text-sm">Carregando configuração…</p> : null}
      {settingsQuery.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar a configuração.</p>
      ) : null}

      {tab === TAB.GREETINGS && settingsQuery.isSuccess ? (
        <WelcomeFarewellForm
          welcomeMessage={welcomeMessage}
          onWelcomeMessageChange={setWelcomeMessage}
          farewellMessage={farewellMessage}
          onFarewellMessageChange={setFarewellMessage}
          onSave={handleSaveGreetings}
          saving={saveMutation.isPending}
          saveSuccess={saveMutation.isSuccess}
          welcomePlaceholders={WELCOME_PLACEHOLDERS}
        />
      ) : null}

      {tab === TAB.TEMPLATES && settingsQuery.isSuccess ? (
        <WhatsAppTemplatesSettings
          templates={templatesQuery.data ?? []}
          loadingTemplates={templatesQuery.isLoading}
          templatesError={templatesQuery.isError}
          onRefreshTemplates={() => void templatesQuery.refetch()}
          selectedTemplateName={templateName}
          onSelectTemplate={handleSelectTemplate}
          variables={templateVariables}
          onVariablesChange={setTemplateVariables}
          saving={saveMutation.isPending}
          saveSuccess={saveMutation.isSuccess}
          onSave={handleSaveTemplate}
          create={{
            value: draft,
            onChange: setDraft,
            onSubmit: handleCreateTemplate,
            submitting: createMutation.isPending,
            result: createResult,
          }}
        />
      ) : null}
    </div>
  )
}

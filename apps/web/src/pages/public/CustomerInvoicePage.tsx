import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

interface PublicInvoice {
  status: string
  model: string
  numeroDocumento: number | null
  serie: string | null
  chaveAcesso: string | null
  totalLiquido: string | null
  qrCodeUrl: string | null
  danfePdfUrl: string | null
  hasXml: boolean
  authorizedAt: string | null
}

function formatChave(chave: string | null): string {
  if (!chave) return '-'
  return chave.replace(/(.{4})/g, '$1 ').trim()
}

export function CustomerInvoicePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-invoice', token],
    queryFn: async (): Promise<PublicInvoice> => {
      const response = await fetch(`${API_URL}/public/fiscal/${token}`)
      if (!response.ok) throw new Error('not found')
      return response.json()
    },
    retry: false,
    enabled: Boolean(token),
  })

  async function handleDownloadXml() {
    const response = await fetch(`${API_URL}/public/fiscal/${token}/xml`)
    if (!response.ok) {
      window.alert('XML indisponível.')
      return
    }
    const payload = (await response.json()) as { xml: string }
    const blob = new Blob([payload.xml], { type: 'application/xml' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `nota-${data?.numeroDocumento ?? token}.xml`
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <header className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900">Nota Fiscal</h1>
          <p className="text-sm text-gray-500">Documento fiscal eletrônico</p>
        </header>

        {isLoading && <p className="text-center text-gray-500">Carregando...</p>}

        {isError && (
          <p className="text-center text-red-600">
            Nota não encontrada ou link inválido.
          </p>
        )}

        {data && (
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Número / Série</span>
              <span className="font-medium text-gray-900">
                {data.numeroDocumento ?? '-'} / {data.serie ?? '-'}
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Modelo</span>
              <span className="font-medium uppercase text-gray-900">{data.model}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Valor</span>
              <span className="font-semibold text-gray-900">
                R$ {Number(data.totalLiquido ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="border-b border-gray-100 pb-2">
              <span className="text-gray-500">Chave de acesso</span>
              <p className="mt-1 break-all font-mono text-xs text-gray-700">
                {formatChave(data.chaveAcesso)}
              </p>
            </div>

            {data.qrCodeUrl && (
              <a
                href={data.qrCodeUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-sm text-blue-600 hover:underline"
              >
                Consultar na SEFAZ (QR Code)
              </a>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {data.danfePdfUrl && (
                <a
                  href={data.danfePdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-gray-900 py-2 text-center font-medium text-white hover:bg-gray-800"
                >
                  Baixar PDF (DANFE)
                </a>
              )}
              {data.hasXml && (
                <button
                  type="button"
                  onClick={handleDownloadXml}
                  className="rounded-lg border border-gray-300 py-2 text-center font-medium text-gray-700 hover:bg-gray-50"
                >
                  Baixar XML
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

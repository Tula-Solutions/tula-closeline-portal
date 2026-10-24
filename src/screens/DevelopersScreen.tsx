import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { EmptyState } from '~/components/app/empty-state'
import { PageHeader } from '~/components/app/page-header'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import publicDocument from '../../openapi/public.openapi.json'

/** The parts of an OpenAPI operation the page shows; every field is optional because the document is data. */
type Operation = {
  readonly summary?: string
  readonly description?: string
  readonly parameters?: readonly {
    readonly name?: string
    readonly in?: string
    readonly required?: boolean
    readonly description?: string
    readonly schema?: unknown
  }[]
  readonly requestBody?: { readonly content?: Record<string, { readonly schema?: unknown }> }
  readonly responses?: Record<string, { readonly description?: string }>
  readonly 'x-closeline-scopes'?: readonly string[]
}

/** An OpenAPI document as far as this page reads it. */
export type PublicDocument = {
  readonly info?: {
    readonly title?: string
    readonly version?: string
    readonly description?: string
  }
  readonly paths?: Record<string, Record<string, Operation | undefined> | undefined>
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

function operationsOf(document: PublicDocument) {
  return Object.entries(document.paths ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, item]) =>
      METHODS.flatMap((method) => {
        const operation = item?.[method]
        return operation === undefined ? [] : [{ path, method, operation }]
      })
    )
}

/**
 * The developer page: how a program gets a token, then the public API as one OpenAPI document the
 * build vendors (it never asks a service for it, so no private route is called). `document` is a
 * prop only so a test can pass a fixture.
 */
export function DevelopersScreen(props: { readonly document?: PublicDocument }) {
  useDocumentTitle('Developers')
  const document = props.document ?? (publicDocument as PublicDocument)
  const operations = operationsOf(document)
  return (
    <>
      <PageHeader
        eyebrow='Organization'
        title='Developers'
        description='Call Closeline from your own programs with an API key. Everything on this page is the public API; nothing here is specific to your Organization.'
      />
      <div className='grid items-start gap-12 lg:grid-cols-12'>
        <section aria-labelledby='token-guide-heading' className='min-w-0 lg:col-span-4'>
          <h2 id='token-guide-heading' className='m-0 border-t border-rule-strong pt-4'>
            Get a token
          </h2>
          <ol className='guide-steps'>
            <li>
              An Owner or Admin creates a key on the <Link to='/api-keys'>API keys</Link> page,
              chooses its scopes, and copies the secret when it is shown. It is shown once.
            </li>
            <li>
              Your program sends the key to <code>POST /v1/token</code> on the auth service. The
              answer is a token that works for 10 minutes. The key itself is never sent anywhere
              else.
            </li>
            <li>
              Send the token as <code>Authorization: Bearer &lt;token&gt;</code> on the calls below.
              When it expires, exchange the key again.
            </li>
          </ol>
          <p className='hint'>
            A token carries the key's scopes and cannot do more than the key's role ceiling allows.
            A revoked key cannot be exchanged, and a token already issued stops working within 10
            minutes.
          </p>
        </section>
        <section
          aria-labelledby='reference-heading'
          className='flex min-w-0 flex-col gap-4 lg:col-span-8 lg:mt-0'
        >
          <h2 id='reference-heading' className='m-0 border-t border-rule-strong pt-4'>
            {document.info?.title ?? 'Public API'}
            {document.info?.version ? (
              <span className='label-mono ml-3'>Version {document.info.version}</span>
            ) : null}
          </h2>
          {operations.length === 0 ? (
            <EmptyState title='No endpoints are open to API keys yet.'>
              They appear here as soon as they are published.
            </EmptyState>
          ) : (
            <ul className='m-0 list-none divide-y border-y p-0' aria-label='Endpoints'>
              {operations.map(({ path, method, operation }) => (
                <EndpointItem
                  key={`${method} ${path}`}
                  path={path}
                  method={method}
                  operation={operation}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function schemaText(schema: unknown): string {
  return JSON.stringify(schema, null, 2) ?? ''
}

function EndpointItem(props: {
  readonly path: string
  readonly method: string
  readonly operation: Operation
}) {
  const { operation } = props
  const title = `${props.method.toUpperCase()} ${props.path}`
  const scopes = operation['x-closeline-scopes'] ?? []
  const body = Object.entries(operation.requestBody?.content ?? {})
  const responses = Object.entries(operation.responses ?? {})
  const parameters = operation.parameters ?? []
  const section = (heading: string, children: ReactNode) => (
    <div className='mt-3'>
      <p className='label-mono m-0'>{heading}</p>
      {children}
    </div>
  )
  return (
    <li className='py-4'>
      <h3 className='item-title m-0 font-mono text-base font-normal'>{title}</h3>
      {operation.summary ? <p className='m-0 mt-1'>{operation.summary}</p> : null}
      {operation.description ? <p className='hint'>{operation.description}</p> : null}
      {scopes.length > 0 ? section('Scope', <p className='m-0'>{scopes.join(', ')}</p>) : null}
      {parameters.length > 0
        ? section(
            'Parameters',
            <ul className='m-0 list-none p-0'>
              {parameters.map((parameter) => (
                <li key={`${parameter.in}:${parameter.name}`}>
                  <code>{parameter.name}</code> ({parameter.in}
                  {parameter.required ? ', required' : ''})
                  {parameter.description ? ` ${parameter.description}` : ''}
                </li>
              ))}
            </ul>
          )
        : null}
      {body.map(([type, content]) =>
        section(
          `Request body, ${type}`,
          <pre className='schema'>
            <code>{schemaText(content.schema)}</code>
          </pre>
        )
      )}
      {responses.length > 0
        ? section(
            'Responses',
            <ul className='m-0 list-none p-0'>
              {responses.map(([status, response]) => (
                <li key={status}>
                  <code>{status}</code>
                  {response.description ? ` ${response.description}` : ''}
                </li>
              ))}
            </ul>
          )
        : null}
    </li>
  )
}

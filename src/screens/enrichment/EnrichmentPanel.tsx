import type { ReactNode } from 'react'
import type { CreateEnrichmentRequest, FieldProvenance, Signal } from 'tula-closeline-contract'
import { presentEnrichment } from '~/api/enrichment-messages'
import { Section } from '~/components/app/section'
import {
  dollars,
  ENRICHED_FIELD_LABEL,
  FIT_RESULT_WORD,
  providerName,
  RUN_WORD,
  STOP_WORD,
  VERIFICATION_WORD,
} from '~/data/enrichment'
import {
  useLatestRun,
  useProspectEnrichment,
  useProspectFit,
  useSignals,
} from '~/data/enrichment-queries'
import { EnrichProgress, useEnrich } from '~/screens/enrichment/useEnrich'
import { Banner } from '~/ui/Banner'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { Untrusted } from '~/ui/Untrusted'
import { When } from '~/ui/When'

const KIND_WORD: Record<Signal['kind'], string> = {
  funding: 'Funding',
  hiring_spike: 'Hiring',
  job_change: 'Job change',
  technology_change: 'Technology',
  website_visit: 'Website visit',
  note: 'Note',
}

function sourceWord(source: Signal['source']): string {
  switch (source.type) {
    case 'provider':
      return providerName(source.provider)
    case 'webhook':
      return 'Your website'
    case 'manual':
      return 'Added by hand'
  }
}

function describe(signal: Signal): ReactNode {
  switch (signal.kind) {
    case 'funding':
      return `Raised a ${signal.round.replaceAll('_', ' ')} round${
        signal.amountMajorUnits === null
          ? ''
          : ` of ${signal.amountMajorUnits.toLocaleString()} ${signal.currency ?? ''}`.trimEnd()
      }.`
    case 'hiring_spike':
      return (
        <>
          {`${signal.openRoles} open roles in ${signal.windowDays} days`}
          {signal.department === null ? null : (
            <>
              {' in '}
              <Untrusted value={signal.department} />
            </>
          )}
          .
        </>
      )
    case 'job_change':
      return (
        <>
          {'Now '}
          <Untrusted value={signal.newTitle} />
          {signal.newCompany === null ? null : (
            <>
              {' at '}
              <Untrusted value={signal.newCompany} />
            </>
          )}
          .
        </>
      )
    case 'technology_change':
      return (
        <>
          {signal.change === 'adopted' ? 'Started using ' : 'Stopped using '}
          <Untrusted value={signal.technology} />.
        </>
      )
    case 'website_visit':
      return (
        <>
          {`Visited ${signal.visitCount} ${signal.visitCount === 1 ? 'time' : 'times'}: `}
          <Untrusted value={signal.pageUrl} />
        </>
      )
    case 'note':
      return <Untrusted value={signal.text} />
  }
}

/**
 * Enrichment on one Prospect: what providers filled in with where and when each value came from
 * and what it cost, the Signals that explain why now, and why the Prospect fits or does not. The
 * Enrich button runs the providers and the panel updates when they are done, with no reload.
 */
export function EnrichmentPanel(props: {
  readonly prospectId: CreateEnrichmentRequest['prospectIds'][number]
  readonly onFail: () => void
}) {
  const { prospectId } = props
  const enrichment = useProspectEnrichment(prospectId)
  const latest = useLatestRun(prospectId)
  const signals = useSignals(prospectId)
  const fit = useProspectFit(prospectId)
  const enrich = useEnrich({ onFail: props.onFail })
  const stopped = latest.data?.stopReason ?? null
  return (
    <Section
      id='enrichment'
      title='Enrichment'
      description='Details that providers filled in, with where and when each came from and what it cost, and the signals and fit that say why this Prospect matters now.'
      actions={
        <button
          type='button'
          className='button'
          aria-disabled={enrich.pending}
          onClick={() => {
            if (!enrich.pending) {
              enrich.start([prospectId])
            }
          }}
        >
          {enrich.pending ? 'Enriching...' : 'Enrich'}
        </button>
      }
    >
      <EnrichProgress progress={enrich.progress} error={enrich.error} />
      {stopped === null ? null : <Banner kind='warning'>{STOP_WORD[stopped]}</Banner>}
      {enrichment.isPending ? (
        <p role='status' className='sr-only'>
          Loading enrichment...
        </p>
      ) : enrichment.isError ? (
        <p className='hint'>{presentEnrichment(enrichment.error).message}</p>
      ) : (
        <>
          {latest.data && stopped === null ? (
            <p className='hint'>Last run: {RUN_WORD[latest.data.status]}.</p>
          ) : null}
          {enrichment.data.fields.length === 0 ? (
            <p className='hint'>
              Nothing has been enriched yet. Press Enrich to ask the providers.
            </p>
          ) : (
            <ScrollRegion label='Enriched fields' bare>
              <table className='ledger-stack' aria-label='Enriched fields'>
                <thead>
                  <tr>
                    <th scope='col'>Field</th>
                    <th scope='col'>Value</th>
                    <th scope='col'>Provider</th>
                    <th scope='col'>Confidence</th>
                    <th scope='col'>Obtained</th>
                    <th scope='col'>Cost</th>
                    <th scope='col'>Kept as</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichment.data.fields.map((field) => (
                    <FieldRow key={field.field} field={field} />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
          {enrichment.data.emailVerification ? (
            <p className='hint'>
              Email check: <strong>{enrichment.data.emailVerification.status}</strong>,{' '}
              {VERIFICATION_WORD[enrichment.data.emailVerification.reason]} (
              {providerName(enrichment.data.emailVerification.provider)},{' '}
              <When iso={enrichment.data.emailVerification.checkedAt} />
              ).
            </p>
          ) : null}
          <p className='hint'>
            Total cost: <strong>{dollars(enrichment.data.costMicros)}</strong>
            {enrichment.data.costByProvider.length === 0 ? null : (
              <>
                {' ('}
                {enrichment.data.costByProvider
                  .map(
                    (cost) =>
                      `${providerName(cost.provider)} ${dollars(cost.costMicros)} for ${cost.calls} ${cost.calls === 1 ? 'call' : 'calls'}`
                  )
                  .join(', ')}
                {')'}
              </>
            )}
            .
          </p>
        </>
      )}
      <h3 className='mt-8 mb-3 font-serif text-xl font-normal'>Signals</h3>
      {signals.isPending ? (
        <p role='status' className='sr-only'>
          Loading signals...
        </p>
      ) : signals.isError ? (
        <p className='hint'>{presentEnrichment(signals.error).message}</p>
      ) : signals.data.items.length === 0 ? (
        <p className='hint'>No signals yet for this Prospect.</p>
      ) : (
        <ol className='m-0 list-none divide-y border-y p-0' aria-label='Signal timeline'>
          {signals.data.items.map((signal) => (
            <li key={signal.id} className='py-3'>
              <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                <span className='label-mono'>{KIND_WORD[signal.kind]}</span>
                <span className='hint'>
                  {sourceWord(signal.source)} · <When iso={signal.observedAt} />
                  {signal.fresh ? '' : ' · out of date'}
                </span>
              </div>
              <p className='m-0'>{describe(signal)}</p>
            </li>
          ))}
        </ol>
      )}
      <h3 className='mt-8 mb-3 font-serif text-xl font-normal'>Fit</h3>
      {fit.isPending ? (
        <p role='status' className='sr-only'>
          Loading fit...
        </p>
      ) : fit.isError ? (
        <p className='hint'>{presentEnrichment(fit.error).message}</p>
      ) : fit.data.matches.length === 0 ? (
        <p className='hint'>No Fit Criteria are set, so there is no score.</p>
      ) : (
        <>
          <p className='m-0'>
            <strong>{`${fit.data.score} of ${fit.data.maxScore}`}</strong> points, scored{' '}
            <When iso={fit.data.scoredAt} />.
          </p>
          <ul className='m-0 list-none divide-y border-y p-0' aria-label='Why this score'>
            {fit.data.matches.map((match) => (
              <li key={match.criterionId} className='py-3'>
                <span className='item-title'>
                  <Untrusted value={match.name} />
                </span>{' '}
                <span className='label-mono'>{FIT_RESULT_WORD[match.result]}</span>
                <span className='hint'>{` · worth ${match.weight}`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

function FieldRow(props: { readonly field: FieldProvenance }) {
  const { field } = props
  return (
    <tr>
      <th scope='row'>{ENRICHED_FIELD_LABEL[field.field]}</th>
      <td>
        <Untrusted value={field.value} />
        {field.truncated ? <span className='hint'> (shortened)</span> : null}
      </td>
      <td>{providerName(field.provider)}</td>
      <td>{field.confidence}%</td>
      <td>
        <When iso={field.obtainedAt} />
      </td>
      <td>{dollars(field.costMicros)}</td>
      <td>
        {field.application === 'written'
          ? 'Saved on the Prospect'
          : 'Suggestion; your value is kept'}
      </td>
    </tr>
  )
}

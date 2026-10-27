import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ERRORS, type Touch } from 'tula-closeline-contract'
import { presentAttribution } from '~/api/analytics-messages'
import { ApiError } from '~/api/errors'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import { useDealAttribution } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { formatCount } from '~/screens/analytics/format'
import { creditWord, sourceWord, touchKindWord } from '~/screens/attribution/words'
import { Banner } from '~/ui/Banner'
import { Paged } from '~/ui/Paged'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/analytics/deals/$dealRecordId')

/** Which touches led to a won or lost Deal: Owners and Admins read it; a Manager or Rep never reaches it and no request is made. */
export function AttributionScreen() {
  useDocumentTitle('Deal attribution')
  const role = useRole()
  if (role === null) {
    return null
  }
  if (!can.viewAttribution(role)) {
    return (
      <>
        <PageHeader eyebrow='Analytics' title='Not allowed' />
        <p role='status' className='notice'>
          Only an Owner or Admin can see which touches led to a Deal. Ask one of them if you need to
          know why a Deal was won or lost.
        </p>
      </>
    )
  }
  return <Attribution />
}

/** One credit column: the touch that earned it, or where to find it. */
function Credit(props: {
  readonly heading: string
  readonly explain: string
  readonly touchId: string | null
  readonly touches: readonly Touch[]
  readonly more: boolean
}) {
  const touch = props.touches.find((t) => t.id === props.touchId)
  const position = touch === undefined ? 0 : props.touches.indexOf(touch) + 1
  return (
    <section aria-label={props.heading} className='border-t border-rule-strong pt-3'>
      <h2 className='label-mono m-0 font-normal'>{props.heading}</h2>
      <p className='hint mt-1 mb-3'>{props.explain}</p>
      {props.touchId === null ? (
        <p className='m-0'>No touch earns this credit.</p>
      ) : touch === undefined ? (
        <p className='m-0'>
          {props.more
            ? 'This touch is on a later page. Show more touches to see it.'
            : 'This touch is not in the list.'}
        </p>
      ) : (
        <p className='m-0 font-serif text-xl leading-snug'>
          {touchKindWord(touch)} {position}, <When iso={touch.occurredAt} />
        </p>
      )}
    </section>
  )
}

function Attribution() {
  const { dealRecordId } = route.useParams()
  const attribution = useDealAttribution(dealRecordId, true)
  const { head, items } = attribution
  const missing =
    attribution.state.isError &&
    !attribution.state.hasData &&
    attribution.state.error instanceof ApiError &&
    attribution.state.error.code === ERRORS['request.not_found'].code
  return (
    <>
      <PageHeader
        eyebrow='Analytics'
        title='Deal attribution'
        description='The Messages and Calls that reached this Deal’s Prospect before it was won or lost, oldest first, and which one gets the credit under each model.'
        actions={
          <Link
            to='/sales-history/deals/$dealRecordId'
            params={{ dealRecordId }}
            className='button button-quiet'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Back to the Deal
          </Link>
        }
      />
      {missing ? (
        <Banner kind='error'>{presentAttribution(attribution.state.error).message}</Banner>
      ) : (
        <Paged
          noun='touches'
          emptyText='No touches'
          emptyHint='Nothing reached this Deal’s Prospect in the look-back, so no touch earns credit.'
          state={attribution.state}
          present={presentAttribution}
        >
          {head === undefined ? null : (
            <>
              <p className='mt-0 mb-1 max-w-[62ch]'>
                {`This Deal was ${head.outcome}. Touches are counted over the last ${head.lookbackDays} days.`}
              </p>
              <p className='mt-0 mb-6 max-w-[62ch] tabular-nums'>
                {`${formatCount(items.length)} ${items.length === 1 ? 'touch' : 'touches'} shown${attribution.state.hasNextPage ? ', and there are more' : ', all of them'}.`}
              </p>
              <div className='mb-10 grid gap-x-8 gap-y-6 sm:grid-cols-2'>
                <Credit
                  heading='First-touch credit'
                  explain='All the credit goes to the first thing that reached the Prospect.'
                  touchId={head.firstTouchId}
                  touches={items}
                  more={attribution.state.hasNextPage}
                />
                <Credit
                  heading='Last-touch credit'
                  explain='All the credit goes to the last thing before the Deal closed.'
                  touchId={head.lastTouchId}
                  touches={items}
                  more={attribution.state.hasNextPage}
                />
              </div>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[34rem] border-collapse text-sm'>
                  <caption className='label-mono mb-1 text-left'>Touches, oldest first</caption>
                  <thead>
                    <tr className='border-b border-rule-strong text-left'>
                      <th scope='col' className='label-mono py-2 pr-4 text-right font-normal'>
                        No.
                      </th>
                      <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                        When
                      </th>
                      <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                        Touch
                      </th>
                      <th scope='col' className='label-mono py-2 pr-4 font-normal'>
                        Credit
                      </th>
                      <th scope='col' className='label-mono py-2 font-normal'>
                        Playbook sources cited
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((touch, index) => (
                      <tr key={touch.id} className='border-b align-top'>
                        <td className='py-2 pr-4 text-right font-mono tabular-nums'>{index + 1}</td>
                        <td className='py-2 pr-4 whitespace-nowrap'>
                          <When iso={touch.occurredAt} />
                        </td>
                        <td className='py-2 pr-4'>{touchKindWord(touch)}</td>
                        <td className='py-2 pr-4'>{creditWord(touch.credit)}</td>
                        <td className='py-2'>
                          {touch.sources.length === 0 ? (
                            <span className='text-muted-foreground'>None</span>
                          ) : (
                            <ul className='m-0 list-none p-0'>
                              {touch.sources.map((source) => (
                                <li key={sourceWord(source)}>{sourceWord(source)}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Paged>
      )}
    </>
  )
}

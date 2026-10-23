import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import {
  MAX_PROSPECT_SEARCH_LENGTH,
  membershipIdSchema,
  type Prospect,
} from 'tula-closeline-contract'
import { PageHeader } from '~/components/app/page-header'
import { can } from '~/data/permissions'
import {
  companyName,
  fieldValue,
  prospectName,
  SOURCE_CHOICES,
  sourceLabel,
} from '~/data/prospects'
import { useMembersFirstPage, useProspectCompanies, useProspects } from '~/data/queries'
import { useRole } from '~/data/session-role'
import { Field } from '~/ui/Field'
import { Paged } from '~/ui/Paged'
import { plain } from '~/ui/plain'
import { ScrollRegion } from '~/ui/ScrollRegion'
import { SelectField } from '~/ui/SelectField'
import { Untrusted } from '~/ui/Untrusted'
import { useDocumentTitle } from '~/ui/useDocumentTitle'
import { When } from '~/ui/When'

const route = getRouteApi('/_app/prospects/')

const STATUS_CHOICES = [
  { value: '', text: 'Any status' },
  { value: 'active', text: 'Active' },
  { value: 'archived', text: 'Archived' },
]

/** The Prospects the signed-in member may see: searched, narrowed and read a page at a time. */
export function ProspectsScreen() {
  useDocumentTitle('Prospects')
  const role = useRole()
  const search = route.useSearch()
  const navigate = useNavigate({ from: '/prospects/' })
  const [draft, setDraft] = useState(search.q ?? '')
  const prospects = useProspects({
    q: search.q,
    status: search.status,
    source: search.source,
    ownerMembershipId: search.owner,
    companyId: search.company,
  })
  const companies = useProspectCompanies()
  const showOwner = role !== null && can.viewMembers(role)
  const members = useMembersFirstPage(showOwner)
  if (role === null) {
    return null
  }
  const narrowed =
    search.q !== undefined ||
    search.status !== undefined ||
    search.source !== undefined ||
    search.owner !== undefined ||
    search.company !== undefined
  const companyNames = new Map(
    (companies.data?.items ?? []).map((company) => [company.id, companyName(company)])
  )
  const change = (next: Partial<typeof search>) =>
    void navigate({ search: (now) => ({ ...now, ...next }), replace: true })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const q = draft.trim()
    change({ q: q === '' ? undefined : q })
  }
  const clear = () => {
    setDraft('')
    void navigate({ search: {}, replace: true })
  }
  const bareEmpty = prospects.state.isEmpty && !narrowed
  const add = (
    <Link to='/prospects/new' className='button'>
      Add a Prospect
    </Link>
  )
  return (
    <>
      <PageHeader
        eyebrow='Sales'
        title='Prospects'
        description='The people you sell to. Every detail keeps its Source, so you can see where it came from.'
        actions={bareEmpty ? undefined : add}
      />
      <div className='flex flex-col gap-4'>
        <search aria-label='Prospect search'>
          <form
            onSubmit={submit}
            className='flex flex-wrap items-end gap-x-3 gap-y-0 border-t border-rule-strong pt-4'
          >
            <div className='min-w-64 flex-1'>
              <Field
                label='Search Prospects'
                name='q'
                type='search'
                autoComplete='off'
                maxLength={MAX_PROSPECT_SEARCH_LENGTH}
                hint='A name, an email address or a phone number.'
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
            <div className='mb-4'>
              <button type='submit' className='button'>
                Search
              </button>
            </div>
          </form>
        </search>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
          <SelectField
            inline
            label='Status'
            value={search.status ?? ''}
            options={STATUS_CHOICES}
            onChange={(event) =>
              change({
                status:
                  event.target.value === ''
                    ? undefined
                    : (event.target.value as 'active' | 'archived'),
              })
            }
          />
          <SelectField
            inline
            label='Source'
            value={search.source ?? ''}
            options={SOURCE_CHOICES}
            onChange={(event) =>
              change({ source: event.target.value === '' ? undefined : event.target.value })
            }
          />
          {showOwner ? (
            <SelectField
              inline
              label='Owner'
              value={search.owner ?? ''}
              options={[
                { value: '', text: 'Any owner' },
                ...members.items.map((member) => ({
                  value: member.id,
                  text: plain(member.name ?? member.email, 'Unnamed member'),
                })),
              ]}
              onChange={(event) => {
                const owner = membershipIdSchema.safeParse(event.target.value)
                change({ owner: owner.success ? owner.data : undefined })
              }}
            />
          ) : null}
          {search.company !== undefined ? (
            <p className='m-0 text-sm'>
              Prospect Company: <Untrusted value={companyNames.get(search.company) ?? 'selected'} />{' '}
              <button
                type='button'
                className='button button-quiet'
                onClick={() => change({ company: undefined })}
              >
                Remove this filter
              </button>
            </p>
          ) : null}
        </div>
        <Paged
          noun='Prospects'
          emptyText={narrowed ? 'No Prospect matches.' : 'There are no Prospects yet.'}
          emptyHint={
            narrowed
              ? 'Change the search or the filters, or clear them to see every Prospect you can see.'
              : 'A Prospect you add is yours until an Owner or Admin gives it to another Rep.'
          }
          emptyAction={
            narrowed ? (
              <button type='button' className='button' onClick={clear}>
                Clear the search and filters
              </button>
            ) : (
              add
            )
          }
          state={prospects.state}
        >
          {prospects.items.length === 0 ? (
            <p className='m-0 border-t pt-4 text-sm text-muted-foreground'>
              None of the Prospects read so far match. Load more to keep looking.
            </p>
          ) : (
            <ScrollRegion label='Prospects'>
              <table className='ledger-stack' aria-label='Prospects'>
                <thead>
                  <tr>
                    <th scope='col'>Prospect</th>
                    <th scope='col'>Email address</th>
                    <th scope='col'>Prospect Company</th>
                    <th scope='col'>Source</th>
                    <th scope='col'>Status</th>
                    <th scope='col'>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.items.map((prospect) => (
                    <ProspectRow
                      key={prospect.id}
                      prospect={prospect}
                      company={
                        prospect.companyId ? companyNames.get(prospect.companyId) : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
        </Paged>
      </div>
    </>
  )
}

function ProspectRow(props: { readonly prospect: Prospect; readonly company: string | undefined }) {
  const { prospect } = props
  const email = fieldValue(prospect, 'email')
  return (
    <tr>
      <th scope='row'>
        <Link to='/prospects/$prospectId' params={{ prospectId: prospect.id }}>
          <Untrusted value={prospectName(prospect)} />
        </Link>
      </th>
      <td>{email === '' ? '—' : <Untrusted value={email} />}</td>
      <td>
        {prospect.companyId === null ? (
          '—'
        ) : (
          <Untrusted value={props.company ?? 'Prospect Company'} />
        )}
      </td>
      <td>{sourceLabel(prospect.source)}</td>
      <td>{prospect.status === 'active' ? 'Active' : 'Archived'}</td>
      <td className='num'>
        <When iso={prospect.createdAt} />
      </td>
    </tr>
  )
}

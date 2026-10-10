import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_ORDER = [
  'DEVELOPER',
  'ADMIN',
  'MANAGER',
  'USER',
]

function formatRole(role) {
  if (!role) return '—'

  return role
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPerson(person) {
  if (!person) return '—'

  return (
    `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() ||
    '—'
  )
}

function getRoleClass(role) {
  if (!role) return ''

  return `person-role person-role-${role.toLowerCase()}`
}

export default function People() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ACTIVE')

  async function loadPeople() {
    try {
      setError('')

      const { data, error: peopleError } = await supabase
        .from('people')
        .select(`
          person_id,
          first_name,
          last_name,
          email,
          phone,
          team_id,
          active,
          system_role,
          created_at,
          updated_at,
          team:teams!people_team_id_fkey (
            team_id,
            team_code,
            team_name
          )
        `)
        .order('first_name', {
          ascending: true,
        })
        .order('last_name', {
          ascending: true,
        })

      if (peopleError) {
        throw peopleError
      }

      setPeople(data ?? [])
    } catch (loadError) {
      console.error('Error loading people:', loadError)

      setError(
        loadError.message ||
          'Failed to load people.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadPeople()
  }, [])

  const teams = useMemo(() => {
    const uniqueTeams = new Map()

    people.forEach((person) => {
      if (!person.team) return

      uniqueTeams.set(
        person.team.team_id,
        person.team
      )
    })

    return Array.from(uniqueTeams.values()).sort(
      (a, b) =>
        a.team_code.localeCompare(
          b.team_code
        )
    )
  }, [people])

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase()

    return people
      .filter((person) => {
        if (
          statusFilter === 'ACTIVE' &&
          !person.active
        ) {
          return false
        }

        if (
          statusFilter === 'INACTIVE' &&
          person.active
        ) {
          return false
        }

        if (
          teamFilter !== 'ALL' &&
          person.team_id !== teamFilter
        ) {
          return false
        }

        if (
          roleFilter !== 'ALL' &&
          person.system_role !== roleFilter
        ) {
          return false
        }

        if (!query) return true

        const searchable = [
          person.first_name,
          person.last_name,
          person.email,
          person.phone,
          person.system_role,
          person.team?.team_code,
          person.team?.team_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return searchable.includes(query)
      })
      .sort((a, b) => {
        const roleA =
          ROLE_ORDER.indexOf(a.system_role)

        const roleB =
          ROLE_ORDER.indexOf(b.system_role)

        if (roleA !== roleB) {
          return (
            (roleA === -1
              ? ROLE_ORDER.length
              : roleA) -
            (roleB === -1
              ? ROLE_ORDER.length
              : roleB)
          )
        }

        return formatPerson(a).localeCompare(
          formatPerson(b)
        )
      })
  }, [
    people,
    search,
    teamFilter,
    roleFilter,
    statusFilter,
  ])

  const activeCount = people.filter(
    (person) => person.active
  ).length

  const inactiveCount = people.filter(
    (person) => !person.active
  ).length

  const adminCount = people.filter(
    (person) =>
      person.active &&
      person.system_role === 'ADMIN'
  ).length

  const managerCount = people.filter(
    (person) =>
      person.active &&
      person.system_role === 'MANAGER'
  ).length

  function handleRefresh() {
    setRefreshing(true)
    loadPeople()
  }

  function clearFilters() {
    setSearch('')
    setTeamFilter('ALL')
    setRoleFilter('ALL')
    setStatusFilter('ACTIVE')
  }

  const hasFilters =
    search.trim() !== '' ||
    teamFilter !== 'ALL' ||
    roleFilter !== 'ALL' ||
    statusFilter !== 'ACTIVE'

  if (loading) {
    return (
      <div className="people-page">
        <div className="people-state">
          Loading people...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="people-page">
        <div className="people-state people-error">
          <strong>
            Unable to load people
          </strong>

          <span>{error}</span>

          <button
            type="button"
            onClick={handleRefresh}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="people-page">

      <div className="people-header">

        <div>
          <p className="people-eyebrow">
            SYSTEM ACCESS
          </p>

          <h1>People</h1>

          <p className="people-subtitle">
            PHX and MGX users, responsibilities,
            and system access.
          </p>
        </div>

        <button
          type="button"
          className="people-refresh"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing
            ? 'Refreshing...'
            : 'Refresh'}
        </button>

      </div>

      <div className="people-summary">

        <div className="people-summary-card">
          <span>Active People</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="people-summary-card">
          <span>PHX</span>
          <strong>
            {
              people.filter(
                (person) =>
                  person.active &&
                  person.team?.team_code ===
                    'PHX'
              ).length
            }
          </strong>
        </div>

        <div className="people-summary-card">
          <span>MGX</span>
          <strong>
            {
              people.filter(
                (person) =>
                  person.active &&
                  person.team?.team_code ===
                    'MGX'
              ).length
            }
          </strong>
        </div>

        <div className="people-summary-card">
          <span>Admins</span>
          <strong>{adminCount}</strong>
        </div>

        <div className="people-summary-card">
          <span>Managers</span>
          <strong>{managerCount}</strong>
        </div>

      </div>

      <div className="people-toolbar">

        <div className="people-search">
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search people..."
            aria-label="Search people"
          />
        </div>

        <select
          value={teamFilter}
          onChange={(event) =>
            setTeamFilter(event.target.value)
          }
          aria-label="Filter by team"
        >
          <option value="ALL">
            All teams
          </option>

          {teams.map((team) => (
            <option
              key={team.team_id}
              value={team.team_id}
            >
              {team.team_code} ·{' '}
              {team.team_name}
            </option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(event) =>
            setRoleFilter(event.target.value)
          }
          aria-label="Filter by role"
        >
          <option value="ALL">
            All roles
          </option>

          {ROLE_ORDER.map((role) => (
            <option
              key={role}
              value={role}
            >
              {formatRole(role)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value)
          }
          aria-label="Filter by status"
        >
          <option value="ACTIVE">
            Active
          </option>

          <option value="INACTIVE">
            Inactive
          </option>

          <option value="ALL">
            All status
          </option>
        </select>

        {hasFilters && (
          <button
            type="button"
            className="people-clear"
            onClick={clearFilters}
          >
            Clear
          </button>
        )}

      </div>

      {filteredPeople.length === 0 ? (
        <div className="people-empty">
          <strong>
            No people found
          </strong>

          <span>
            Try changing your search or filters.
          </span>
        </div>
      ) : (
        <div className="people-table-wrapper">

          <table className="people-table">

            <thead>
              <tr>
                <th>Person</th>
                <th>Team</th>
                <th>System Role</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>

              {filteredPeople.map((person) => (
                <tr key={person.person_id}>

                  <td>
                    <div className="person-name">
                      <strong>
                        {formatPerson(person)}
                      </strong>

                      {person.email && (
                        <span>
                          {person.email}
                        </span>
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="person-team">
                      <strong>
                        {person.team?.team_code ||
                          '—'}
                      </strong>

                      <span>
                        {person.team?.team_name ||
                          '—'}
                      </span>
                    </div>
                  </td>

                  <td>
                    <span
                      className={getRoleClass(
                        person.system_role
                      )}
                    >
                      {formatRole(
                        person.system_role
                      )}
                    </span>
                  </td>

                  <td>
                    {person.phone || '—'}
                  </td>

                  <td>
                    <span
                      className={`person-status ${
                        person.active
                          ? 'active'
                          : 'inactive'
                      }`}
                    >
                      {person.active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </td>

                </tr>
              ))}

            </tbody>

          </table>

        </div>
      )}

      <div className="people-footer">
        Showing {filteredPeople.length} of{' '}
        {people.length} people
        {inactiveCount > 0 &&
          ` · ${inactiveCount} inactive`}
      </div>

    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'


function RLSTest() {
  const { user } = useAuth()

  const [person, setPerson] = useState(null)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPerson() {
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('people')
        .select(`
          person_id,
          first_name,
          last_name,
          email,
          phone,
          system_role,
          active,
          team_id
        `)
        .eq('auth_user_id', user.id)
        .single()

      if (error) {
        console.error('Error loading person:', error)
      } else {
        setPerson(data)
      }

      setLoading(false)
    }

    loadPerson()
  }, [user])

  function addResult(name, allowed, message) {
    setResults((current) => [
      ...current,
      {
        name,
        allowed,
        message,
      },
    ])
  }

  async function testReadAssets() {
    const { data, error } = await supabase
      .from('assets')
      .select('asset_id')
      .limit(1)

    addResult(
      'Read assets',
      !error,
      error
        ? error.message
        : `Allowed (${data.length} row returned)`,
    )
  }

  async function testInsertAsset() {
    const { error } = await supabase
      .from('assets')
      .insert({
        asset_code: 'RLS-TEST-DO-NOT-KEEP',
        name: 'RLS Test Asset',
        make: 'TEST',
        model: 'TEST',
        asset_type: 'TEST',
        status: 'AVAILABLE',
      })

    addResult(
      'Insert asset',
      !error,
      error ? error.message : 'Allowed',
    )
  }

  async function testUpdateAsset() {
    const { data: asset, error: fetchError } = await supabase
      .from('assets')
      .select('asset_id, notes')
      .limit(1)
      .single()

    if (fetchError) {
      addResult(
        'Update asset',
        false,
        fetchError.message,
      )
      return
    }

    const originalNotes = asset.notes

    const { data, error } = await supabase
      .from('assets')
      .update({
        notes: originalNotes,
      })
      .eq('asset_id', asset.asset_id)
      .select('asset_id')

    const allowed = !error && data?.length === 1

    addResult(
      'Update asset',
      allowed,
      error
        ? error.message
        : allowed
          ? 'Allowed'
          : 'Denied by RLS (0 rows updated)',
    )
  }

  async function testReadPeople() {
    const { data, error } = await supabase
      .from('people')
      .select('person_id')
      .limit(1)

    addResult(
      'Read people',
      !error,
      error
        ? error.message
        : `Allowed (${data.length} row returned)`,
    )
  }

  async function testUpdatePeople() {
    if (!person) {
      addResult(
        'Update people',
        false,
        'No current people record found',
      )
      return
    }

    const { data, error } = await supabase
      .from('people')
      .update({
        phone: person.phone ?? null,
      })
      .eq('person_id', person.person_id)
      .select('person_id')

    const allowed = !error && data?.length === 1

    addResult(
      'Update people',
      allowed,
      error
        ? error.message
        : allowed
          ? 'Allowed'
          : 'Denied by RLS (0 rows updated)',
    )
  }

  async function testReadKits() {
    const { data, error } = await supabase
      .from('kits')
      .select('kit_id')
      .limit(1)

    addResult(
      'Read kits',
      !error,
      error
        ? error.message
        : `Allowed (${data.length} row returned)`,
    )
  }

  async function testUpdateKits() {
    const { data: kit, error: fetchError } = await supabase
      .from('kits')
      .select('kit_id, kit_code, active')
      .eq('active', true)
      .limit(1)
      .single()

    if (fetchError) {
      addResult(
        'Update kits',
        false,
        `Fetch failed: ${fetchError.message}`,
      )
      return
    }

    const { data, error } = await supabase
      .from('kits')
      .update({
        active: true,
      })
      .eq('kit_id', kit.kit_id)
      .select('kit_id, kit_code, active')

    const allowed = !error && data?.length === 1

    addResult(
      'Update kits',
      allowed,
      error
        ? error.message
        : allowed
          ? `Allowed: ${data[0].kit_code}`
          : 'Denied by RLS (0 rows updated)',
    )
  }

  async function testReadTeams() {
    const { data, error } = await supabase
      .from('teams')
      .select('team_id')
      .limit(1)

    addResult(
      'Read teams',
      !error,
      error
        ? error.message
        : `Allowed (${data.length} row returned)`,
    )
  }

  async function testUpdateTeams() {
    const { data: team, error: fetchError } = await supabase
      .from('teams')
      .select('team_id, active')
      .eq('active', true)
      .limit(1)
      .single()

    if (fetchError) {
      addResult(
        'Update teams',
        false,
        `Fetch failed: ${fetchError.message}`,
      )
      return
    }

    const { data, error } = await supabase
      .from('teams')
      .update({
        active: true,
      })
      .eq('team_id', team.team_id)
      .select('team_id')

    const allowed = !error && data?.length === 1

    addResult(
      'Update teams',
      allowed,
      error
        ? error.message
        : allowed
          ? 'Allowed'
          : 'Denied by RLS (0 rows updated)',
    )
  }

  async function testRoleFunctions() {
    const { data: personId, error: personError } =
      await supabase.rpc('current_person_id')

    addResult(
      'current_person_id()',
      !personError && !!personId,
      personError
        ? personError.message
        : `Returned: ${personId}`,
    )

    const roles = [
      'USER',
      'MANAGER',
      'ADMIN',
      'DEVELOPER',
    ]

    for (const role of roles) {
      const { data, error } = await supabase.rpc(
        'current_user_has_role',
        {
          p_role: role,
        },
      )

      addResult(
        `current_user_has_role('${role}')`,
        !error && data === true,
        error
          ? error.message
          : `Returned: ${data}`,
      )
    }
  }

  async function testChangeAssetStatusRPC() {
    if (!person) {
      addResult(
        'RPC: change_asset_status',
        false,
        'No current person',
      )
      return
    }

    const { error } = await supabase.rpc(
      'change_asset_status',
      {
        p_asset_id:
          '00000000-0000-0000-0000-000000000000',
        p_to_status: 'INVALID_TEST_STATUS',
        p_performed_by: person.person_id,
        p_reason: 'RLS security test',
        p_notes: 'Deliberately invalid test input',
      },
    )

    addResult(
      'RPC: change_asset_status',
      !!error,
      error
        ? error.message
        : 'Unexpectedly succeeded',
    )
  }

  async function testHandoverRPC() {
    if (!person) {
      addResult(
        'RPC: handover_asset',
        false,
        'No current person',
      )
      return
    }

    const { error } = await supabase.rpc(
      'handover_asset',
      {
        p_asset_id:
          '00000000-0000-0000-0000-000000000000',
        p_to_possession_id:
          '00000000-0000-0000-0000-000000000000',
        p_performed_by: person.person_id,
        p_reason: 'RLS security test',
        p_notes: 'Deliberately invalid test input',
      },
    )

    addResult(
      'RPC: handover_asset',
      !!error,
      error
        ? error.message
        : 'Unexpectedly succeeded',
    )
  }

  async function testTransferKitRPC() {
    if (!person) {
      addResult(
        'RPC: transfer_asset_kit',
        false,
        'No current person',
      )
      return
    }

    const { error } = await supabase.rpc(
      'transfer_asset_kit',
      {
        p_asset_id:
          '00000000-0000-0000-0000-000000000000',
        p_to_kit_id:
          '00000000-0000-0000-0000-000000000000',
        p_performed_by: person.person_id,
        p_reason: 'RLS security test',
        p_notes: 'Deliberately invalid test input',
      },
    )

    addResult(
      'RPC: transfer_asset_kit',
      !!error,
      error
        ? error.message
        : 'Unexpectedly succeeded',
    )
  }

  async function testDecideRequestRPC() {
    if (!person) {
      addResult(
        'RPC: decide_asset_request',
        false,
        'No current person',
      )
      return
    }

    const { error } = await supabase.rpc(
      'decide_asset_request',
      {
        p_request_id:
          '00000000-0000-0000-0000-000000000000',
        p_decision: 'APPROVED',
        p_decided_by: person.person_id,
        p_notes: 'RLS security test',
      },
    )

    addResult(
      'RPC: decide_asset_request',
      !!error,
      error
        ? error.message
        : 'Unexpectedly succeeded',
    )
  }

  async function testFulfilRequestRPC() {
    if (!person) {
      addResult(
        'RPC: fulfil_asset_request',
        false,
        'No current person',
      )
      return
    }

    const { error } = await supabase.rpc(
      'fulfil_asset_request',
      {
        p_request_id:
          '00000000-0000-0000-0000-000000000000',
        p_performed_by: person.person_id,
        p_reason: 'RLS security test',
        p_notes: 'Deliberately invalid test input',
      },
    )

    addResult(
      'RPC: fulfil_asset_request',
      !!error,
      error
        ? error.message
        : 'Unexpectedly succeeded',
    )
  }

  async function runRPCSecurityTests() {
    setResults([])

    await testChangeAssetStatusRPC()
    await testHandoverRPC()
    await testTransferKitRPC()
    await testDecideRequestRPC()
    await testFulfilRequestRPC()
  }

  async function runAllTests() {
    setResults([])

    await testReadAssets()
    await testInsertAsset()
    await testUpdateAsset()

    await testReadPeople()
    await testUpdatePeople()

    await testReadKits()
    await testUpdateKits()

    await testReadTeams()
    await testUpdateTeams()

    await testRoleFunctions()

    await testChangeAssetStatusRPC()
    await testHandoverRPC()
    await testTransferKitRPC()
    await testDecideRequestRPC()
    await testFulfilRequestRPC()
  }

  if (loading) {
    return <div className="rls-loading">Loading...</div>
  }

  return (
  <div
    style={{
      minHeight: '100vh',
      padding: '32px',
      background: '#f5f7f6',
      color: '#18201d',
    }}
  >
    <div style={{ marginBottom: '24px' }}>
      <h1
        style={{
          margin: '0 0 8px',
          color: '#18201d',
          fontSize: '28px',
          fontWeight: 700,
        }}
      >
        RLS & RPC Security Test
      </h1>

      <p
        style={{
          margin: 0,
          color: '#66716c',
          fontSize: '14px',
        }}
      >
        Verify database permissions and protected
        inventory operations.
      </p>
    </div>

    <section
      style={{
        marginBottom: '20px',
        padding: '24px',
        background: '#ffffff',
        border: '1px solid #e1e5e3',
        borderRadius: '10px',
      }}
    >
      <h2
        style={{
          margin: '0 0 18px',
          color: '#18201d',
          fontSize: '17px',
        }}
      >
        Current User
      </h2>

      {person ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(2, minmax(0, 1fr))',
            gap: '18px 32px',
          }}
        >
          <div>
            <div
              style={{
                color: '#7a8580',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Name
            </div>

            <strong>
              {person.first_name} {person.last_name}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: '#7a8580',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Email
            </div>

            <strong>{person.email}</strong>
          </div>

          <div>
            <div
              style={{
                color: '#7a8580',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Role
            </div>

            <strong
              style={{
                display: 'inline-block',
                padding: '4px 9px',
                borderRadius: '5px',
                background: '#edf3ef',
                color: '#24543b',
                fontSize: '12px',
              }}
            >
              {person.system_role}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: '#7a8580',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Auth UID
            </div>

            <strong
              style={{
                color: '#34413b',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 500,
                wordBreak: 'break-all',
              }}
            >
              {user?.id}
            </strong>
          </div>

          <div>
            <div
              style={{
                color: '#7a8580',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Person ID
            </div>

            <strong
              style={{
                color: '#34413b',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 500,
                wordBreak: 'break-all',
              }}
            >
              {person.person_id}
            </strong>
          </div>
        </div>
      ) : (
        <p>No people record found for this auth user.</p>
      )}
    </section>

    <section
      style={{
        marginBottom: '20px',
        padding: '24px',
        background: '#ffffff',
        border: '1px solid #e1e5e3',
        borderRadius: '10px',
      }}
    >
      <h2
        style={{
          margin: '0 0 18px',
          color: '#18201d',
          fontSize: '17px',
        }}
      >
        Tests
      </h2>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={runAllTests}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderRadius: '6px',
            background: '#1f5138',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Run All Tests
        </button>

        <button
          onClick={runRPCSecurityTests}
          style={{
            padding: '10px 16px',
            border: '1px solid #cfd6d2',
            borderRadius: '6px',
            background: '#ffffff',
            color: '#26332d',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Run RPC Security Tests
        </button>
      </div>
    </section>

    {results.length > 0 && (
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#18201d',
              fontSize: '17px',
            }}
          >
            Results
          </h2>

          <span
            style={{
              color: '#7a8580',
              fontSize: '13px',
            }}
          >
            {results.length} tests
          </span>
        </div>

        {results.map((result, index) => (
          <div
            key={index}
            style={{
              marginBottom: '10px',
              padding: '14px 16px',
              background: '#ffffff',
              border: '1px solid #e1e5e3',
              borderRadius: '8px',
              borderLeft: `4px solid ${
                result.allowed
                  ? '#3c7955'
                  : '#b44a4a'
              }`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                color: '#18201d',
                fontSize: '14px',
              }}
            >
              <strong
                style={{
                  color: result.allowed
                    ? '#2d7049'
                    : '#b23f3f',
                }}
              >
                {result.allowed ? '✓' : '✕'}
              </strong>

              <strong>{result.name}</strong>
            </div>

            <div
              style={{
                marginTop: '7px',
                paddingLeft: '25px',
                color: '#66716c',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {result.message}
            </div>
          </div>
        ))}
      </section>
    )}
  </div>
)
}

export default RLSTest
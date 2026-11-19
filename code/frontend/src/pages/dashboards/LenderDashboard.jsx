import { useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import Breadcrumb from '../../components/Breadcrumb'
import ScoreBadge from '../../components/ScoreBadge'
import StatusChip from '../../components/StatusChip'
import { useApi } from '../../hooks/useApi'

function ReputationCard({ lenderId, token }) {
  const { data, loading, error } = useApi(() => api.lenderReputation(lenderId, token), [lenderId])
  return (
    <div className="card" data-tour="l-rep">
      <h2>Your reputation score</h2>
      <p className="card-sub">A marketplace ranking badge -- better rates and more activity raise it.</p>
      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <div className="hero-figure">{data.reputation_score}</div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Rank {data.rank} of {data.n_lenders}. {data.explanation}
          </p>
        </>
      )}
    </div>
  )
}

function ShgsByDistrict({ token }) {
  const { data, loading, error } = useApi(() => api.listShgs({}, token), [])
  const [filter, setFilter] = useState('')
  if (loading) return <div className="loading">Loading SHGs...</div>
  if (error) return <div className="error-banner">{error}</div>
  const districts = [...new Set(data.map((s) => s.district))].sort()
  const rows = filter ? data.filter((s) => s.district === filter) : data
  return (
    <div className="card" data-tour="l-shgs">
      <h2>SHGs by district</h2>
      <p className="card-sub">Browse Self-Help Groups by area (summary only -- name, village, district, member count).</p>
      <div className="search-row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All districts</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <table>
        <thead><tr><th>Group</th><th>Village</th><th>District</th><th>Members</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td className="muted">{s.village}</td>
              <td className="muted">{s.district}</td>
              <td>{s.n_members_actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinkedShgMembers({ lenderId, token }) {
  const { data: links, reload } = useApi(() => api.lenderLinks(lenderId, token), [lenderId])
  const [openShg, setOpenShg] = useState(null)
  const { data: shgDetail } = useApi(() => (openShg ? api.getShg(openShg, token) : Promise.resolve(null)), [openShg])
  const { data: allShgs } = useApi(() => api.listShgs({}, token), [])

  const decide = async (linkId, approve) => {
    try {
      await api.decideLink(linkId, approve, '', token)
      await reload()
    } catch (e) {
      alert(e.message)
    }
  }

  const nameFor = (shgId) => allShgs?.find((s) => s.id === shgId)?.name || `SHG #${shgId}`

  if (!links) return <div className="loading">Loading your links...</div>

  return (
    <div className="card" data-tour="l-links">
      <h2>Your linked SHGs</h2>
      <p className="card-sub">
        Approved links let you see full member detail. Pending-incoming links are SHG-initiated requests awaiting
        your decision; pending-outgoing are your own requests awaiting the SHG.
      </p>

      <h3 className="section-subheading">Approved</h3>
      <table>
        <thead><tr><th>SHG</th><th>Status</th><th>Requested</th><th></th></tr></thead>
        <tbody>
          {links.approved.map((l) => (
            <tr key={l.id}>
              <td>{nameFor(l.shg_id)}</td>
              <td><StatusChip status={l.status} /></td>
              <td className="muted">{l.requested_date}</td>
              <td><button className="btn" onClick={() => setOpenShg(l.shg_id)} data-tour="l-view-members">View members</button></td>
            </tr>
          ))}
          {links.approved.length === 0 && <tr><td colSpan={4} className="muted">No approved links yet.</td></tr>}
        </tbody>
      </table>

      <h3 className="section-subheading">Pending -- awaiting your decision</h3>
      <table>
        <thead><tr><th>SHG</th><th>Requested</th><th></th></tr></thead>
        <tbody>
          {links.pending_incoming.map((l) => (
            <tr key={l.id}>
              <td>{nameFor(l.shg_id)}</td>
              <td className="muted">{l.requested_date}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn good" onClick={() => decide(l.id, true)}>Approve Partnership</button>
                  <button className="btn critical" onClick={() => decide(l.id, false)}>Reject Partnership</button>
                </div>
              </td>
            </tr>
          ))}
          {links.pending_incoming.length === 0 && <tr><td colSpan={3} className="muted">Nothing awaiting your decision.</td></tr>}
        </tbody>
      </table>

      <h3 className="section-subheading">Pending -- awaiting the SHG</h3>
      <table>
        <thead><tr><th>SHG</th><th>Requested</th><th>Status</th></tr></thead>
        <tbody>
          {links.pending_outgoing.map((l) => (
            <tr key={l.id}>
              <td>{nameFor(l.shg_id)}</td>
              <td className="muted">{l.requested_date}</td>
              <td><StatusChip status="Pending" /></td>
            </tr>
          ))}
          {links.pending_outgoing.length === 0 && <tr><td colSpan={3} className="muted">No outgoing requests pending.</td></tr>}
        </tbody>
      </table>

      {openShg && shgDetail && (
        <div className="notice-banner" style={{ marginTop: 16 }} data-tour="l-members">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>{shgDetail.name} members</h3>
            <button className="btn" onClick={() => setOpenShg(null)}>Close</button>
          </div>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Name</th><th>Score</th></tr></thead>
            <tbody>
              {(shgDetail.members || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td><ScoreBadge riskCategory={m.risk_category} score={m.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RequestLinkCard({ lenderId, token, onLinked }) {
  const { data: shgs } = useApi(() => api.listShgs({}, token), [])
  const [pickShg, setPickShg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!pickShg) return
    setBusy(true)
    try {
      await api.createLenderLink(lenderId, Number(pickShg), '', token)
      setPickShg('')
      await onLinked()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" data-tour="l-link-request">
      <h2>Request a partnership</h2>
      <p className="card-sub">Send a lender-initiated link request to a Self-Help Group.</p>
      <div className="search-row">
        <select value={pickShg} onChange={(e) => setPickShg(e.target.value)}>
          <option value="">Choose an SHG...</option>
          {(shgs || []).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
        </select>
        <button className="btn primary" disabled={!pickShg || busy} onClick={submit}>Send request</button>
      </div>
    </div>
  )
}

function OfferForm({ lenderId, individualId, token, onDone }) {
  const [principal, setPrincipal] = useState(15000)
  const [rate, setRate] = useState(14)
  const [tenure, setTenure] = useState(12)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await api.proposeOffer({ lender_id: lenderId, individual_id: individualId, principal: Number(principal), rate: Number(rate), tenure: Number(tenure) }, token)
      onDone()
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} data-tour="l-offer-form">
      <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} style={{ width: 100 }} title="Principal" />
      <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 70 }} title="Rate %" />
      <input type="number" value={tenure} onChange={(e) => setTenure(e.target.value)} style={{ width: 70 }} title="Tenure (months)" />
      <button className="btn primary" disabled={busy} onClick={submit}>{busy ? '...' : 'Propose'}</button>
    </div>
  )
}

function EligibleBorrowersCard({ lenderId, token }) {
  const { data: eligible, reload } = useApi(() => api.eligibleBorrowers(lenderId, token), [lenderId])
  const [offeringFor, setOfferingFor] = useState(null)

  const handleOfferDone = async () => {
    setOfferingFor(null)
    await reload()
  }

  return (
    <div className="card" data-tour="l-eligible">
      <h2>Eligible borrowers</h2>
      <p className="card-sub">
        Members of SHGs approved with you, plus independents (if you serve them), who clear your score threshold.
      </p>
      <table>
        <thead><tr><th>Name</th><th>District</th><th>Group</th><th>Score</th><th></th></tr></thead>
        <tbody>
          {(eligible || []).slice(0, 25).map((b) => (
            <tr key={b.individual_id}>
              <td>{b.name}</td>
              <td className="muted">{b.district}</td>
              <td>{b.is_shg_linked ? b.shg_name : <span className="muted">Independent</span>}</td>
              <td><ScoreBadge riskCategory={b.risk_category} score={b.score} /></td>
              <td>
                {offeringFor === b.individual_id
                  ? <OfferForm lenderId={lenderId} individualId={b.individual_id} token={token} onDone={handleOfferDone} />
                  : <button className="btn" onClick={() => setOfferingFor(b.individual_id)} data-tour="l-propose">Propose offer</button>}
              </td>
            </tr>
          ))}
          {(!eligible || eligible.length === 0) && (
            <tr><td colSpan={5} className="muted">No eligible borrowers yet -- link with SHGs or lower the threshold.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function OffersCard({ lenderId, token }) {
  const { data: offers, reload } = useApi(() => api.listOffers({ lender_id: lenderId }, token), [lenderId])
  const decide = async (offerId, accept) => {
    try {
      await api.decideOffer(offerId, accept, token)
      await reload()
    } catch (e) {
      alert(e.message)
    }
  }
  return (
    <div className="card" data-tour="l-offers">
      <h2>Your offers</h2>
      <table>
        <thead><tr><th>Borrower</th><th>Principal</th><th>Rate</th><th>Tenure</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {(offers || []).map((o) => (
            <tr key={o.id}>
              <td>{o.individual_name}</td>
              <td>Rs. {o.principal_offer.toLocaleString('en-IN')}</td>
              <td>{o.rate_offer}%</td>
              <td>{o.tenure_offer}mo</td>
              <td><StatusChip status={o.status} /></td>
              <td>
                {o.status === 'Proposed' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn good" onClick={() => decide(o.id, true)}>Accept</button>
                    <button className="btn critical" onClick={() => decide(o.id, false)}>Reject</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {(!offers || offers.length === 0) && <tr><td colSpan={6} className="muted">No offers yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function RequestDecisionForm({ requestId, lenderId, token, onDone }) {
  const [rate, setRate] = useState(14)
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setBusy(true)
    try {
      await api.decideLoanRequest(requestId, { lender_id: lenderId, approve: true, rate: Number(rate) }, token)
      await onDone()
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }
  const decline = async () => {
    setBusy(true)
    try {
      await api.decideLoanRequest(requestId, { lender_id: lenderId, approve: false }, token)
      await onDone()
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={{ width: 70 }} title="Rate %" data-tour="l-rate" />
      <button className="btn good" disabled={busy} onClick={approve} data-tour="l-approve">Approve</button>
      <button className="btn critical" disabled={busy} onClick={decline}>Decline</button>
    </div>
  )
}

function LoanRequestsCard({ lenderId, token }) {
  const { data: requests, reload } = useApi(() => api.listLoanRequests({ lender_id: lenderId }, token), [lenderId])
  const pending = (requests || []).filter((r) => r.status === 'Pending')
  const decided = (requests || []).filter((r) => r.status !== 'Pending')

  return (
    <div className="card" data-tour="l-requests">
      <h2>Incoming loan requests</h2>
      <p className="card-sub">
        Borrower-initiated requests you're currently eligible to fund -- approving one creates the loan
        immediately, reflected live below.
      </p>
      <table>
        <thead><tr><th>Borrower</th><th>Principal</th><th>Tenure</th><th>Purpose</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {pending.map((r) => (
            <tr key={r.id} data-tour="l-request-row" data-request-id={r.id} data-status={r.status}>
              <td>{r.individual_name}</td>
              <td>Rs. {r.requested_principal.toLocaleString('en-IN')}</td>
              <td>{r.requested_tenure}mo</td>
              <td className="muted">{r.purpose || '--'}</td>
              <td><StatusChip status={r.status} /></td>
              <td><RequestDecisionForm requestId={r.id} lenderId={lenderId} token={token} onDone={reload} /></td>
            </tr>
          ))}
          {decided.map((r) => (
            <tr key={r.id} data-tour="l-request-row" data-request-id={r.id} data-status={r.status}>
              <td>{r.individual_name}</td>
              <td>Rs. {r.requested_principal.toLocaleString('en-IN')}</td>
              <td>{r.requested_tenure}mo</td>
              <td className="muted">{r.purpose || '--'}</td>
              <td><StatusChip status={r.status} /></td>
              <td></td>
            </tr>
          ))}
          {pending.length === 0 && decided.length === 0 && (
            <tr><td colSpan={6} className="muted">No loan requests yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function LenderDashboard() {
  const { auth } = useAuth()
  const token = auth.token
  const lenderId = auth.id
  const [linksVersion, setLinksVersion] = useState(0)

  return (
    <div>
      <Breadcrumb items={[{ label: 'Lender Dashboard' }]} />
      <h1>Welcome back, {auth.name}.</h1>
      <p className="page-intro">
        Your linked SHGs and their members, eligible borrowers, incoming requests, and your marketplace reputation.
      </p>

      <ReputationCard lenderId={lenderId} token={token} />
      <ShgsByDistrict token={token} />
      <RequestLinkCard lenderId={lenderId} token={token} onLinked={() => setLinksVersion((v) => v + 1)} />
      <LinkedShgMembers key={linksVersion} lenderId={lenderId} token={token} />
      <EligibleBorrowersCard lenderId={lenderId} token={token} />
      <LoanRequestsCard lenderId={lenderId} token={token} />
      <OffersCard lenderId={lenderId} token={token} />
    </div>
  )
}

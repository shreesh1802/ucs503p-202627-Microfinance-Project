import { useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import Breadcrumb from '../../components/Breadcrumb'
import ScoreBadge from '../../components/ScoreBadge'
import StatusChip from '../../components/StatusChip'
import { useApi } from '../../hooks/useApi'

export default function ShgDashboard() {
  const { auth } = useAuth()
  const token = auth.token
  const shgId = auth.id

  const { data: shg, loading, error } = useApi(() => api.getShg(shgId, token), [shgId])
  const { data: links, reload: reloadLinks } = useApi(() => api.shgLenders(shgId, token), [shgId])
  const { data: lenders } = useApi(() => api.listLenders(token), [])
  const [pickLender, setPickLender] = useState('')
  const [busy, setBusy] = useState(false)

  const handleRequest = async () => {
    if (!pickLender) return
    setBusy(true)
    try {
      await api.linkLender(shgId, Number(pickLender), '', token)
      setPickLender('')
      await reloadLinks()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDecide = async (linkId, approve) => {
    setBusy(true)
    try {
      await api.decideLink(linkId, approve, '', token)
      await reloadLinks()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading">Loading...</div>
  if (error) return <div className="error-banner">{error}</div>
  if (!shg) return null

  const linkedLenderIds = new Set((links || []).map((l) => l.lender_id))
  const availableLenders = (lenders || []).filter((l) => !linkedLenderIds.has(l.id))
  // Per docs/SPEC.md §4: approve/reject buttons render on the SHG side only
  // for links the *lender* initiated -- the SHG's own outgoing requests just
  // show "awaiting their decision".
  const decidable = (l) => l.status === 'Pending' && l.initiated_by_role === 'lender'

  return (
    <div>
      <Breadcrumb items={[{ label: 'SHG Dashboard' }]} />
      <h1>{shg.name}</h1>
      <p className="page-intro">{shg.village}, {shg.district} &middot; formed {shg.formed_date}</p>

      <div className="card" data-tour="s-stats">
        <h2>Group stats</h2>
        <div className="grid cols-4">
          <div className="stat-tile"><p className="label">Members</p><p className="value">{shg.n_members_actual}</p></div>
          <div className="stat-tile"><p className="label">Avg score</p><p className="value">{shg.avg_member_score ?? '--'}</p></div>
          <div className="stat-tile"><p className="label">Repayment rate</p><p className="value">{shg.aggregate_repayment_rate != null ? `${Math.round(shg.aggregate_repayment_rate * 100)}%` : '--'}</p></div>
          <div className="stat-tile"><p className="label">Attendance</p><p className="value">{shg.aggregate_attendance_rate != null ? `${Math.round(shg.aggregate_attendance_rate * 100)}%` : '--'}</p></div>
        </div>
      </div>

      <div className="card" data-tour="s-links">
        <h2>Linked lenders</h2>
        <p className="card-sub">Approving a lender here makes your members visible to it in the matching view.</p>
        <table>
          <thead><tr><th>Lender</th><th>Status</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            {(links || []).map((l) => (
              <tr key={l.link_id}>
                <td>{l.lender_name}</td>
                <td><StatusChip status={l.status} /></td>
                <td className="muted">{l.requested_date}</td>
                <td>
                  {decidable(l) && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn good" disabled={busy} onClick={() => handleDecide(l.link_id, true)}>Approve Partnership</button>
                      <button className="btn critical" disabled={busy} onClick={() => handleDecide(l.link_id, false)}>Reject Partnership</button>
                    </div>
                  )}
                  {l.status === 'Pending' && l.initiated_by_role !== 'lender' && (
                    <span className="muted small">Awaiting their decision</span>
                  )}
                </td>
              </tr>
            ))}
            {(!links || links.length === 0) && (
              <tr><td colSpan={4} className="muted">No lender links yet.</td></tr>
            )}
          </tbody>
        </table>
        <div className="search-row" style={{ marginTop: 16 }} data-tour="s-link-request">
          <select value={pickLender} onChange={(e) => setPickLender(e.target.value)}>
            <option value="">Request a link to...</option>
            {availableLenders.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
          </select>
          <button className="btn primary" disabled={!pickLender || busy} onClick={handleRequest}>Request link</button>
        </div>
      </div>

      <div className="card" data-tour="s-members">
        <h2>Members</h2>
        <table>
          <thead><tr><th>Name</th><th>Score</th></tr></thead>
          <tbody>
            {(shg.members || []).map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td><ScoreBadge riskCategory={m.risk_category} score={m.score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

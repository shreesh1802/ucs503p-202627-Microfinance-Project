import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import Breadcrumb from '../../components/Breadcrumb'
import DistrictHeatmap from '../../components/DistrictHeatmap'
import ScoreBadge from '../../components/ScoreBadge'
import StatusChip from '../../components/StatusChip'
import { useApi } from '../../hooks/useApi'

function StatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <p className="label">{label}</p>
      <p className="value">{value}</p>
    </div>
  )
}

function LoanStatusChart({ summary }) {
  const data = [
    { status: 'Active', n: summary.n_loans_active },
    { status: 'Closed', n: summary.n_loans_closed },
    { status: 'Defaulted', n: summary.n_loans_defaulted },
  ]
  const colorFor = { Active: 'var(--status-info)', Closed: 'var(--status-approved)', Defaulted: 'var(--status-rejected)' }
  return (
    <BarChart layout="vertical" width={420} height={140} data={data} margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
      <XAxis type="number" hide />
      <YAxis type="category" dataKey="status" width={70} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
      <Tooltip cursor={{ fill: 'var(--surface-2)' }} />
      <Bar dataKey="n" radius={2} maxBarSize={22}>
        {data.map((d) => <Cell key={d.status} fill={colorFor[d.status]} />)}
        <LabelList dataKey="n" position="right" style={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
      </Bar>
    </BarChart>
  )
}

function AnomaliesCard({ token }) {
  const { data, loading, error, reload } = useApi(() => api.listAnomalies(token), [])
  const [running, setRunning] = useState(false)

  const rerun = async () => {
    setRunning(true)
    try {
      await api.runAnomalyDetection(token)
      await reload()
    } catch (e) {
      alert(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="card" data-tour="a-anomalies">
      <h2>Anomaly flags</h2>
      <p className="card-sub">
        Isolation-forest outliers over repayment/savings behaviour -- a flag for review, not an automatic penalty.
      </p>
      <button className="btn" onClick={rerun} disabled={running} style={{ marginBottom: 12 }}>
        {running ? 'Running...' : 'Re-run detection'}
      </button>
      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <table>
          <thead><tr><th>Individual</th><th>Anomaly score</th><th>Reason</th><th>Flag</th></tr></thead>
          <tbody>
            {data.slice(0, 15).map((a) => (
              <tr key={a.individual_id}>
                <td>{a.individual_name}</td>
                <td className="muted">{a.anomaly_score.toFixed(3)}</td>
                <td className="small">{a.reason}</td>
                <td><StatusChip status="Flagged" /></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="muted">No anomalies flagged.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ModelHealthCard({ token }) {
  const { data, loading, error } = useApi(() => api.modelHealth(token), [])
  return (
    <div className="card" data-tour="a-model">
      <h2>Model / scoring health</h2>
      <p className="card-sub">Fig 1: Scoring engine status, read directly from the last training artifact.</p>
      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <div className="grid cols-4">
            <StatTile label="Scored / total" value={`${data.n_scored} / ${data.n_total}`} />
            <StatTile label="Model version" value={data.model_version} />
            <StatTile label="Last computed" value={data.last_computed} />
            <StatTile label="Holdout AUC" value={data.holdout_auc} />
            <StatTile label="Holdout accuracy" value={data.holdout_accuracy} />
            <StatTile label="Training rows" value={data.n_training_rows} />
            <StatTile label="SHG-linked-only training" value={data.trained_on_shg_linked_only ? 'Yes' : 'No'} />
          </div>
          <table style={{ marginTop: 16 }}>
            <thead><tr><th>Score band</th><th>Count</th></tr></thead>
            <tbody>
              {data.score_distribution.map((b) => (
                <tr key={b.bucket}><td>{b.bucket}</td><td>{b.count}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function IndividualsBrowser({ token }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data, loading, error } = useApi(
    () => api.listIndividuals({ limit: 25, search: debounced || undefined }, token),
    [debounced],
  )
  const { data: detail } = useApi(() => (selected ? api.getIndividual(selected, token) : Promise.resolve(null)), [selected])

  return (
    <div className="card" data-tour="a-borrowers">
      <h2>All borrowers</h2>
      <p className="card-sub">Full population search/browse -- admin-only (read-only oversight).</p>
      <div className="search-row">
        <input placeholder="Search borrowers..." value={query} onChange={(e) => setQuery(e.target.value)} data-tour="a-search" />
      </div>
      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <>
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>District</th><th>SHG / Independent</th><th>Score</th></tr></thead>
            <tbody>
              {data.items.map((ind) => (
                <tr key={ind.id} className="clickable" onClick={() => setSelected(ind.id)}>
                  <td style={{ fontWeight: 600 }}>{ind.name}</td>
                  <td className="muted">{ind.phone}</td>
                  <td className="muted">{ind.district}</td>
                  <td>{ind.is_shg_linked ? ind.shg_name : <span className="muted">Independent</span>}</td>
                  <td><ScoreBadge riskCategory={ind.latest_score?.risk_category} score={ind.latest_score?.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>Showing {data.items.length} of {data.total} borrowers.</p>
        </>
      )}
      {detail && (
        <div className="notice-banner" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>{detail.name}</h3>
            <button className="btn" onClick={() => setSelected(null)}>Close</button>
          </div>
          <p className="small muted">
            {detail.phone} &middot; {detail.district} &middot; {detail.occupation} &middot;{' '}
            {detail.is_shg_linked ? `SHG: ${detail.shg_name}` : 'Independent'}
          </p>
          <ScoreBadge riskCategory={detail.latest_score?.risk_category} score={detail.latest_score?.score} />
        </div>
      )}
    </div>
  )
}

function LinksOverview({ token }) {
  const { data, loading, error } = useApi(() => api.listLinks({}, token), [])
  return (
    <div className="card" data-tour="a-links">
      <h2>SHG &ndash; lender links (platform-wide)</h2>
      <p className="card-sub">Read-only -- admin does not decide links, only views them.</p>
      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-banner">{error}</div>}
      {data && (
        <table>
          <thead><tr><th>SHG</th><th>Lender</th><th>Status</th><th>Initiated by</th><th>Requested</th></tr></thead>
          <tbody>
            {data.slice(0, 30).map((l) => (
              <tr key={l.id}>
                <td>{l.shg_name}</td>
                <td>{l.lender_name}</td>
                <td><StatusChip status={l.status} /></td>
                <td className="muted">{l.initiated_by_role}</td>
                <td className="muted">{l.requested_date}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5} className="muted">No links yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { auth } = useAuth()
  const token = auth.token
  const { data: summary, loading, error } = useApi(() => api.dashboardSummary(token), [])
  const { data: districts } = useApi(() => api.geoDistricts(token), [])

  return (
    <div>
      <Breadcrumb items={[{ label: 'Admin Dashboard' }]} />
      <h1>Platform oversight</h1>
      <p className="page-intro">
        Read-only, platform-wide view: every borrower, SHG, and lender, district stats, anomaly flags, and model
        health. No moderation actions here except the scoring/anomaly compute operations below.
      </p>

      {loading && <div className="loading">Loading dashboard...</div>}
      {error && <div className="error-banner">{error}</div>}
      {summary && (
        <div className="card" data-tour="a-portfolio">
          <h2>Portfolio overview</h2>
          <div className="grid cols-4">
            <StatTile label="Total borrowers" value={summary.n_individuals} />
            <StatTile label="SHG-linked" value={summary.n_shg_linked} />
            <StatTile label="Independent" value={summary.n_independent} />
            <StatTile label="Self-help groups" value={summary.n_shgs} />
            <StatTile label="Lenders" value={summary.n_lenders} />
            <StatTile label="Districts" value={summary.n_districts} />
            <StatTile label="Avg score (SHG)" value={summary.avg_score_shg_linked ?? '--'} />
            <StatTile label="Avg score (independent)" value={summary.avg_score_independent ?? '--'} />
          </div>
        </div>
      )}

      {summary && (
        <div className="grid cols-2">
          <div className="card" data-tour="a-loans">
            <h2>Loan status</h2>
            <p className="card-sub">{summary.n_loans} loans total &middot; {(summary.default_rate * 100).toFixed(1)}% default rate</p>
            <LoanStatusChart summary={summary} />
          </div>
          <AnomaliesCard token={token} />
        </div>
      )}

      <div className="card" data-tour="a-heatmap">
        <h2>District trust heatmap</h2>
        <p className="card-sub">Fig 2: K-means clusters on avg score / default rate / SHG density, by district.</p>
        <DistrictHeatmap rows={districts} />
      </div>

      <ModelHealthCard token={token} />
      <LinksOverview token={token} />
      <IndividualsBrowser token={token} />
    </div>
  )
}

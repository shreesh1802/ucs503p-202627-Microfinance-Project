import { Link } from 'react-router-dom'
import { useTour } from '../tour/TourContext'
import { api } from '../api/client'
import { useApi } from '../hooks/useApi'

const STEPS = [
  {
    n: 1,
    title: 'Everyone builds their own score',
    body: 'A credit score here comes from one person’s own repayment history, savings behaviour, and (if they have one) SHG participation — never a copy of someone else’s.',
  },
  {
    n: 2,
    title: 'SHG members get a head start',
    body: 'If you belong to a Self-Help Group, your starting score is bootstrapped from your group’s track record — attendance, savings regularity, and how well the group has repaid past loans.',
  },
  {
    n: 3,
    title: 'Independents build from scratch',
    body: 'No SHG? You can still get scored — you start from a lower flat base with no group boost, and every on-time repayment moves your own score up from there.',
  },
  {
    n: 4,
    title: 'Four separate, role-gated logins',
    body: 'Borrowers, lenders, SHGs, and bank/admin each get their own dashboard — never a combined view. Every scoped endpoint is enforced server-side, not just hidden in the UI.',
  },
]

function HomeStatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <p className="label">{label}</p>
      <p className="value">{value ?? '--'}</p>
    </div>
  )
}

const EXPLORE_CARDS = [
  {
    to: '/login/borrower',
    tag: 'For borrowers',
    title: 'Log in and see your own score',
    body: 'A personal, logged-in view of your score, how it has changed over time, why, and which lenders you’re eligible for — nothing about any other borrower.',
    cta: 'Borrower login',
  },
  {
    to: '/login/lender',
    tag: 'For lenders',
    title: 'Manage SHG partnerships and offers',
    body: 'See SHGs by district, your linked groups’ members, incoming loan requests, and your own marketplace reputation score.',
    cta: 'Lender login',
  },
  {
    to: '/login/shg',
    tag: 'For Self-Help Groups',
    title: 'Manage your group',
    body: 'Your own members, group stats, and lender links — approve or reject partnership requests from lenders.',
    cta: 'SHG login',
  },
  {
    to: '/login/admin',
    tag: 'For banks & analysts',
    title: 'Platform-wide oversight',
    body: 'Read-only view across every borrower, SHG, and lender — district stats, anomaly flags, and model health.',
    cta: 'Bank / Admin login',
  },
]

function BorrowerStories({ stories }) {
  if (!stories?.length) return null
  return (
    <div className="card">
      <h2>Borrower improvement stories</h2>
      <p className="card-sub">Real score movement from real borrowers on the platform.</p>
      <div className="grid cols-2">
        {stories.map((s) => (
          <div key={s.individual_id} className="step-card">
            <h3>{s.name}</h3>
            <p className="small muted">
              {s.district}{s.shg_name ? ` · ${s.shg_name}` : ' · Independent'}
            </p>
            <p>
              Score moved from <strong>{s.first_score}</strong> to <strong>{s.last_score}</strong>{' '}
              (<span style={{ color: 'var(--status-approved)' }}>+{s.delta}</span>){' '}
              driven largely by {s.top_positive_feature.replace(/_/g, ' ')}.
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShgSpotlights({ spotlights }) {
  if (!spotlights?.length) return null
  return (
    <div className="card">
      <h2>Self-Help Group spotlights</h2>
      <table>
        <thead><tr><th>Group</th><th>Village</th><th>District</th><th>Members</th><th>Repayment rate</th></tr></thead>
        <tbody>
          {spotlights.map((s) => (
            <tr key={s.shg_id}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td className="muted">{s.village}</td>
              <td className="muted">{s.district}</td>
              <td>{s.n_members}</td>
              <td>{Math.round(s.repayment_rate * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LenderSpotlights({ spotlights }) {
  if (!spotlights?.length) return null
  return (
    <div className="card">
      <h2>Lender spotlights</h2>
      <table>
        <thead><tr><th>Lender</th><th>Type</th><th>Offers made</th><th>SHG links</th><th>Reputation</th></tr></thead>
        <tbody>
          {spotlights.map((l) => (
            <tr key={l.lender_id}>
              <td style={{ fontWeight: 600 }}>{l.name}</td>
              <td className="muted">{l.type}</td>
              <td>{l.n_offers}</td>
              <td>{l.n_shg_links}</td>
              <td>{l.reputation_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DistrictImprovement({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="card">
      <h2>District-level improvement</h2>
      <p className="card-sub">Average score delta among improving borrowers, by district.</p>
      <table>
        <thead><tr><th>District</th><th>Avg delta</th><th>Borrowers</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.district}>
              <td>{r.district}</td>
              <td>+{r.avg_delta}</td>
              <td>{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HomeView() {
  const { openChooser } = useTour()
  const { data: highlights } = useApi(() => api.homeHighlights(), [])

  return (
    <div>
      <div className="card hero" data-tour="home-hero">
        <span className="badge hero-badge">
          <span className="dot" style={{ background: 'var(--primary)' }} />
          For SHGs &amp; independent borrowers
        </span>
        <h1>Credit trust, built by each person's own history.</h1>
        <p className="hero-lead">
          This is a microfinance credit-scoring engine for India. Self-Help Group members start with a trust
          boost earned by their group; independent borrowers build a score purely from their own repayment and
          savings behaviour. Every score comes with a clear explanation of why it is what it is, and lenders
          only extend offers to borrowers they're formally matched with. Four separate logins — borrower,
          lender, SHG, bank/admin — keep everyone's data to themselves.
        </p>
        <div className="hero-actions">
          <Link className="btn primary" to="/login/borrower">Borrower login</Link>
          <Link className="btn" to="/login/lender">Lender login</Link>
          <Link className="btn" to="/login/shg">SHG login</Link>
          <Link className="btn" to="/login/admin">Bank / Admin login</Link>
          <button type="button" className="btn demo-btn" onClick={openChooser}>&#9654; Start guided demo</button>
        </div>
      </div>

      {highlights && (
        <div className="grid cols-4" style={{ marginBottom: 16 }}>
          <HomeStatTile label="Borrower stories" value={highlights.borrower_stories?.length} />
          <HomeStatTile label="SHG spotlights" value={highlights.shg_spotlights?.length} />
          <HomeStatTile label="Lender spotlights" value={highlights.lender_spotlights?.length} />
          <HomeStatTile label="Districts improving" value={highlights.district_improvement?.length} />
        </div>
      )}

      {highlights && (
        <>
          <BorrowerStories stories={highlights.borrower_stories} />
          <div className="grid cols-2">
            <ShgSpotlights spotlights={highlights.shg_spotlights} />
            <LenderSpotlights spotlights={highlights.lender_spotlights} />
          </div>
          <DistrictImprovement rows={highlights.district_improvement} />
        </>
      )}

      <div className="card">
        <h2>How the scoring works</h2>
        <p className="card-sub">Four ideas explain the whole system.</p>
        <div className="step-grid">
          {STEPS.map((s) => (
            <div className="step-card" key={s.n}>
              <span className="step-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <h2 className="section-heading">Where do you want to start?</h2>
      <div className="grid cols-3">
        {EXPLORE_CARDS.map((c) => (
          <Link className="card explore-card" to={c.to} key={c.to}>
            <span className="explore-tag">{c.tag}</span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
            <span className="explore-cta">{c.cta} &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

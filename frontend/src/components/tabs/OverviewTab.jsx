import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { formatCount, formatPercent, formatShortDay } from '../../utils/formatters';
import { apiFetch } from '../../utils/api';
import { Activity, Zap, Sparkles, Download } from 'lucide-react';


// ── Period selector options ──────────────────────────────────────────────────
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

// ── Top Questions Panel ───────────────────────────────────────────────────────
function TopQuestionsPanel({ rows, periodLabel }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const downloadCSV = () => {
    if (!rows.length) return;
    const header = 'Rank,Question,Count\n';
    const body = rows
      .map((r, i) => `${i + 1},"${(r.question || '').replace(/"/g, '""')}",${r.count}`)
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top_questions_${periodLabel.replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="panel compact-panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', margin: 0 }}>Top Questions — {periodLabel}</h3>
        {rows.length > 0 && (
          <button
            onClick={downloadCSV}
            title="Download as CSV"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', fontSize: '11px', fontWeight: 600,
              border: '1px solid var(--line-strong)', borderRadius: '4px',
              background: 'transparent', color: 'var(--ink)',
              cursor: 'pointer', opacity: 0.75, transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.75'}
          >
            <Download size={11} />
            CSV
          </button>
        )}
      </div>

      <div className="top-questions-list" style={{ gap: 0 }}>
        {rows.map((row, idx) => {
          const isExpanded = expandedIdx === idx;
          return (
            <div
              key={`${row.question}-${idx}`}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              style={{
                display: 'flex', flexDirection: 'column',
                paddingBottom: '6px', paddingTop: '6px',
                borderBottom: '1px solid var(--line)',
                fontSize: '12px', cursor: 'pointer',
                background: isExpanded ? 'rgba(15,107,58,0.04)' : 'transparent',
                transition: 'background 0.15s',
                borderRadius: isExpanded ? '4px' : '0',
                padding: isExpanded ? '8px' : '6px 0',
                margin: isExpanded ? '2px 0' : '0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                  {/* Rank badge */}
                  <span style={{
                    flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%',
                    background: idx < 3 ? 'var(--moss)' : 'var(--line-strong)',
                    color: idx < 3 ? '#fff' : 'var(--ink)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 700,
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0,
                    whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    overflow: isExpanded ? 'visible' : 'hidden',
                    textOverflow: isExpanded ? 'clip' : 'ellipsis',
                    lineHeight: '1.4',
                    color: 'var(--ink)',
                  }}>
                    {row.question}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <strong style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{formatCount(row.count)}×</strong>
                  <span style={{ fontSize: '10px', opacity: 0.4 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p className="muted" style={{ fontSize: '12px', padding: '8px 0' }}>No repeated questions.</p>
        )}
      </div>
    </article>
  );
}

export function OverviewTab({ analytics: initialAnalytics }) {
  const [period, setPeriod] = useState('today');
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [lfData, setLfData] = useState(initialAnalytics?.langfuse || {});
  const [loading, setLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Sync state when initialAnalytics updates from parent (e.g. on manual refresh)
  useEffect(() => {
    if (initialAnalytics) {
      setAnalytics(initialAnalytics);
      setLfData(initialAnalytics.langfuse || {});
    }
  }, [initialAnalytics]);

  // Fetch both analytics + Langfuse whenever period changes
  const fetchData = useCallback(async (p, from, to) => {
    setLoading(true);
    try {
      let suffix = `period=${p}`;
      if (p === 'custom' && from) suffix += `&from=${from}`;
      if (p === 'custom' && to)   suffix += `&to=${to}`;
      const [analyticsData, langfuseData] = await Promise.all([
        apiFetch(`/api/admin/analytics/summary?${suffix}`),
        apiFetch(`/api/admin/metrics/langfuse?${suffix}`),
      ]);
      setAnalytics(analyticsData);
      setLfData(langfuseData || {});
    } catch (_) {
      // keep previous data on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Avoid redundant fetch for 'today' if parent has already loaded it on mount
    if (period === 'today' && initialAnalytics && initialAnalytics.langfuse) {
      return;
    }
    if (period === 'custom') return; // wait for user to pick dates
    fetchData(period);
  }, [period, fetchData, initialAnalytics]);

  if (!analytics) return <div className="empty-state">Loading overview data...</div>;

  const periodLabel = analytics.period_label || 'Today';
  const trendData = analytics.trend_data || analytics.queries_last_7_days || [];
  const trendMax = Math.max(1, ...trendData.map((item) => Number(item.queries || 0)));
  const dailyCost = lfData.daily_total_cost || 0.0;
  const periodCost = lfData.period_total_cost ?? dailyCost;
  const recentQueries = lfData.recent_queries || [];
  const INR_RATE = 83.5; // Conversion rate USD to INR

  // Tick formatter: show MM/DD for week/month/custom, hour for today
  const tickFmt = (d) => {
    if (!d) return '';
    if (period === 'today') {
      return d;
    }
    return d.slice(5); // format YYYY-MM-DD to MM-DD
  };

  return (
    <div className="fade-in tab-content-inner">

      {/* ── Period Selector ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <p style={{ fontSize: '13px', color: 'var(--ink)', opacity: 0.6, margin: 0 }}>
          Showing metrics for: <strong>{periodLabel}</strong>
          {loading && <span style={{ marginLeft: '8px', opacity: 0.5 }}>↻ refreshing…</span>}
        </p>
        <div
          role="group"
          aria-label="Select metrics period"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
        >
          <div style={{ display: 'flex', background: 'var(--line)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                id={`period-btn-${key}`}
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: period === key ? '600' : '400',
                  background: period === key ? 'var(--paper)' : 'transparent',
                  color: period === key ? 'var(--moss)' : 'var(--ink)',
                  boxShadow: period === key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 0.18s ease',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date pickers — appear when 'Custom' is selected */}
          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  border: '1px solid var(--line-strong)', borderRadius: '4px',
                  background: 'var(--paper)', color: 'var(--ink)',
                }}
              />
              <span style={{ fontSize: '11px', opacity: 0.5 }}>→</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  border: '1px solid var(--line-strong)', borderRadius: '4px',
                  background: 'var(--paper)', color: 'var(--ink)',
                }}
              />
              <button
                onClick={() => { if (customFrom) fetchData('custom', customFrom, customTo); }}
                disabled={!customFrom || loading}
                style={{
                  padding: '4px 12px', fontSize: '12px', fontWeight: 600,
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                  background: 'var(--moss)', color: '#fff',
                  opacity: !customFrom || loading ? 0.5 : 1,
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Grid (Categorized & Beautiful) ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', marginBottom: '24px' }}>
        
        {/* SECTION 1: USER TRAFFIC & CONVERSATIONS */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--moss)', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} /> User Traffic & Engagement
          </h3>
          <div className="metric-grid admin-metric-grid compact" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <article className="metric-card" style={{ borderLeft: '4px solid var(--moss)', background: 'linear-gradient(to right, var(--paper), rgba(15, 107, 58, 0.03))' }}>
              <span className="metric-label">Active Users (Now / DAU)</span>
              <strong className="metric-value text-green">
                {analytics.active_users_now ?? 0} <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--ink)', opacity: 0.6 }}>/</span> {analytics.dau ?? 0}
              </strong>
              <span className="metric-note">Active 5 mins / 24 hrs</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--moss)' }}>
              <span className="metric-label">Active Users (WAU / MAU)</span>
              <strong className="metric-value">
                {formatCount(analytics.wau)} <span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.6 }}>/ {formatCount(analytics.mau)}</span>
              </strong>
              <span className="metric-note">Active 7 days / 30 days</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--teal)' }}>
              <span className="metric-label">Total Sessions ({periodLabel})</span>
              <strong className="metric-value">{formatCount(analytics.sessions_today)}</strong>
              <span className="metric-note">Total chatbot widget opens</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--teal)' }}>
              <span className="metric-label">Total Questions Asked ({periodLabel})</span>
              <strong className="metric-value">{formatCount(analytics.queries_today)}</strong>
              <span className="metric-note">Total input messages logged</span>
            </article>
          </div>
        </div>

        {/* SECTION 2: ENGAGEMENT & AI QUALITY */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--orange)', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={14} /> Engagement & Bot Quality
          </h3>
          <div className="metric-grid admin-metric-grid compact" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <article className="metric-card" style={{ borderLeft: '4px solid var(--orange)', background: 'linear-gradient(to right, var(--paper), rgba(234, 88, 12, 0.03))' }}>
              <span className="metric-label">Avg. Messages per User</span>
              <strong className="metric-value text-orange">{(analytics.avg_queries_per_user ?? 0).toFixed(1)}</strong>
              <span className="metric-note">Avg. questions asked when user opens chatbot</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--teal)' }}>
              <span className="metric-label">Cache Hit Rate</span>
              <strong className="metric-value">{formatPercent(analytics.cache_hit_rate_today)}</strong>
              <span className="metric-note">Percent resolved via L1/L2 Cache</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--orange)' }}>
              <span className="metric-label">Avg. Response Latency</span>
              <strong className="metric-value">{analytics.avg_latency_ms_today ? `${formatCount(analytics.avg_latency_ms_today)} ms` : 'N/A'}</strong>
              <span className="metric-note">Server processing latency</span>
            </article>

            <article className="metric-card" style={{ borderLeft: '4px solid var(--moss)' }}>
              <span className="metric-label">Feedback Ratings ({periodLabel})</span>
              <strong className="metric-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-green">{formatCount(analytics.feedback_today?.up)} 👍</span>
                <span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.4 }}>/</span>
                <span className="text-red">{formatCount(analytics.feedback_today?.down)} 👎</span>
              </strong>
              <span className="metric-note">Total rating entries: {formatCount(analytics.feedback_today?.total)}</span>
            </article>
          </div>
        </div>

        {/* SECTION 3: API COSTS */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} /> API Usage & Costs
          </h3>
          <div className="metric-grid admin-metric-grid compact" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <article className="metric-card" style={{ borderLeft: '4px solid var(--moss)' }}>
              <span className="metric-label">{period === 'today' ? 'API Cost Today' : `Total Cost (${periodLabel})`}</span>
              <strong className="metric-value text-green" title={`$${periodCost.toFixed(5)} USD`}>
                ₹{(periodCost * INR_RATE).toFixed(period === 'today' ? 3 : 2)}
              </strong>
              <span className="metric-note">Estimated Azure OpenAI deployment cost</span>
            </article>
          </div>
        </div>

      </div>

      {/* ── Main panels ───────────────────────────────────────────────── */}
      <div
        className="dashboard-main-grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}
      >

        {/* Route mix */}
        <article className="panel compact-panel">
          <div className="panel-header">
            <h3 style={{ fontSize: '14px' }}>Route Mix — {periodLabel}</h3>
          </div>
          <div className="health-list" style={{ gap: '8px' }}>
            {(analytics.route_breakdown_today || []).slice(0, 8).map((row) => (
              <div key={row.route} className="health-item" style={{ paddingBottom: '4px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: '12px' }}>{row.route}</span>
                <strong style={{ fontSize: '12px', color: 'var(--moss)' }}>
                  {formatCount(row.count)} ({formatPercent(row.share)})
                </strong>
              </div>
            ))}
            {!analytics.route_breakdown_today?.length && (
              <p className="muted" style={{ fontSize: '12px' }}>No route data yet.</p>
            )}
          </div>
        </article>


        {/* Top questions */}
        <TopQuestionsPanel rows={analytics.top_questions_today || []} periodLabel={periodLabel} />


        {/* Recent Langfuse traces */}
        <article className="panel compact-panel">
          <div className="panel-header">
            <h3 style={{ fontSize: '14px' }}>Recent Query Costs (Langfuse)</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
            {/* Period cost summary pill */}
            {periodCost > 0 && (
              <div style={{
                background: 'var(--line)',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '11px', opacity: 0.7 }}>{periodLabel} Total</span>
                <strong style={{ fontSize: '13px', color: 'var(--moss)' }} title={`$${periodCost.toFixed(4)} USD`}>
                  ₹{(periodCost * INR_RATE).toFixed(2)}
                </strong>
              </div>
            )}
            {recentQueries.slice(0, 10).map((q) => (
              <div
                key={q.id}
                style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '8px', borderBottom: '1px solid var(--line)' }}
              >
                <span className="truncate-cell" style={{ fontSize: '12px', color: 'var(--ink)' }}>
                  {q.input_preview || 'Empty query'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ink)', opacity: 0.7 }}>
                  <span>{new Date(q.timestamp).toLocaleTimeString()}</span>
                  <span>{q.latency > 0 ? `${q.latency.toFixed(2)} s` : 'N/A'}</span>
                  <strong className="text-orange" title={q.cost >= 0 ? `$${q.cost.toFixed(6)} USD` : ''}>
                    {q.cost >= 0 ? `₹${(q.cost * INR_RATE).toFixed(4)}` : 'Pending...'}
                  </strong>
                </div>
              </div>
            ))}
            {!recentQueries.length && (
              <p className="muted" style={{ fontSize: '12px' }}>No recent traces found or Langfuse not configured.</p>
            )}
          </div>
        </article>

        {/* Trend chart */}
        <article className="panel compact-panel" style={{ gridColumn: 'span 2' }}>
          <div className="panel-header">
            <h3 style={{ fontSize: '14px' }}>
              {period === 'today'  && 'Queries — Last 24 Hours'}
              {period === 'week'   && 'Queries — Last 7 Days'}
              {period === 'month'  && 'Queries — Last 30 Days'}
              {period === 'custom' && `Queries — ${customFrom || '…'} → ${customTo || 'now'}`}
            </h3>
          </div>
          {trendData.length > 1 ? (
            <div style={{ height: '160px', padding: '8px 12px 4px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="var(--ink)"
                    tickFormatter={tickFmt}
                    interval={period === 'month' ? 4 : 0}
                  />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="var(--ink)" />
                  <RTooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', fontSize: '12px' }}
                    labelFormatter={(v) => v}
                  />
                  <Line
                    type="monotone"
                    dataKey="queries"
                    stroke="var(--moss)"
                    strokeWidth={2.5}
                    dot={trendData.length <= 7 ? { r: 4, fill: 'var(--paper)', strokeWidth: 2 } : false}
                    activeDot={{ r: 5 }}
                    name="Queries"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* Fallback: bar-style list for single/few data points */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              {trendData.map((row) => (
                <div key={row.day} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ minWidth: '60px', color: 'var(--ink)' }}>{formatShortDay(row.day)}</span>
                  <div style={{ flex: 1, height: '4px', background: 'var(--line)', borderRadius: '2px' }}>
                    <div style={{ width: `${(Number(row.queries || 0) / trendMax) * 100}%`, background: 'var(--moss)', height: '100%', borderRadius: '2px' }} />
                  </div>
                  <strong style={{ minWidth: '30px', textAlign: 'right' }}>{formatCount(row.queries)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../utils/api';
import SessionChatHistory from '../SessionChatHistory';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toIST(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return isoStr; }
}

function timeAgo(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}

function StatusBadge({ status }) {
  const cfg = {
    active: { bg: 'rgba(15,107,58,0.12)', color: '#0f6b3a', dot: '#16a34a' },
    idle:   { bg: 'rgba(234,88,12,0.1)',  color: '#c2410c', dot: '#ea580c' },
    ended:  { bg: 'rgba(107,114,128,0.1)',color: '#4b5563', dot: '#9ca3af' },
  }[status] || { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.dot }} />
      {status || 'ended'}
    </span>
  );
}

function RouteMiniBar({ rag, cache, blocked, correction, total }) {
  if (!total) return <span style={{ opacity: 0.35, fontSize: '11px' }}>—</span>;
  const bars = [
    { count: rag,        color: '#0f6b3a', label: 'rag' },
    { count: cache,      color: '#2563eb', label: 'cache' },
    { count: correction, color: '#7c3aed', label: 'correction' },
    { count: blocked,    color: '#dc2626', label: 'blocked' },
  ].filter(b => b.count > 0);
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {bars.map(b => (
        <span key={b.label} title={`${b.label}: ${b.count}`} style={{
          display: 'inline-block', height: '10px', borderRadius: '2px',
          width: `${Math.max(6, (b.count / total) * 50)}px`, background: b.color,
        }} />
      ))}
      <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '3px' }}>{total}</span>
    </div>
  );
}

// ── Date Range Helpers ────────────────────────────────────────────────────────

function getPeriodRange(period) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return { from: todayStart, to: null };
  if (period === 'week')  { const f = new Date(todayStart); f.setDate(f.getDate() - 6); return { from: f, to: null }; }
  if (period === 'month') { const f = new Date(todayStart); f.setDate(f.getDate() - 29); return { from: f, to: null }; }
  return null;
}

function applyDateFilter(items, dateField, period, customFrom, customTo) {
  if (period === 'all') return items;
  let from, to;
  if (period === 'custom') {
    from = customFrom ? new Date(customFrom) : null;
    to = customTo ? new Date(customTo + 'T23:59:59') : null;
  } else {
    const range = getPeriodRange(period);
    from = range?.from || null;
    to = range?.to || null;
  }
  return items.filter(item => {
    const d = item[dateField] ? new Date(item[dateField]) : null;
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function VisitorSessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [allChats, setAllChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('sessions');
  const [chatHistorySession, setChatHistorySession] = useState(null);
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/admin/sessions?page_size=100', { headers: { 'X-Admin-User': 'dashboard-admin' } })
      .then(d => { setSessions(d.sessions || []); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view === 'chats' && allChats.length === 0 && !chatsLoading) {
      setChatsLoading(true);
      apiFetch('/api/admin/analytics/chats?limit=300', { headers: { 'X-Admin-User': 'dashboard-admin' } })
        .then(d => setAllChats(d.chats || []))
        .catch(() => {})
        .finally(() => setChatsLoading(false));
    }
  }, [view]);

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      (s.session_id || '').toLowerCase().includes(q) ||
      (s.first_question || '').toLowerCase().includes(q) ||
      (s.last_question || '').toLowerCase().includes(q) ||
      (s.department_slug || '').toLowerCase().includes(q) ||
      (s.device_hint || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const dateSessions = useMemo(
    () => applyDateFilter(filteredSessions, 'started_at', period, customFrom, customTo),
    [filteredSessions, period, customFrom, customTo]
  );

  const filteredChats = useMemo(() => {
    if (!search.trim()) return allChats;
    const q = search.toLowerCase();
    return allChats.filter(c =>
      (c.question || '').toLowerCase().includes(q) ||
      (c.answer || '').toLowerCase().includes(q) ||
      (c.session_id || '').toLowerCase().includes(q)
    );
  }, [allChats, search]);

  const dateChats = useMemo(
    () => applyDateFilter(filteredChats, 'created_at', period, customFrom, customTo),
    [filteredChats, period, customFrom, customTo]
  );

  const activeSessions = dateSessions.filter(s => s.status === 'active').length;
  const totalMessages   = dateSessions.reduce((acc, s) => acc + (s.total_messages || 0), 0);
  const mobileSessions  = dateSessions.filter(s => (s.device_hint || '').toLowerCase() === 'mobile').length;
  const mobilePct       = dateSessions.length > 0 ? Math.round((mobileSessions / dateSessions.length) * 100) : 0;
  const avgDurationRaw  = dateSessions.length > 0
    ? dateSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0) / dateSessions.length
    : null;
  const avgDuration = avgDurationRaw !== null ? fmtDuration(avgDurationRaw) : '—';

  if (loading) return <div className="empty-state" style={{ padding: '60px' }}>Loading visitor sessions...</div>;
  if (error)   return <div className="empty-state" style={{ color: 'var(--danger)', padding: '40px' }}>Error: {error}</div>;

  return (
    <div className="fade-in tab-content-inner">

      {/* ── Period Filter Bar ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 14px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginRight: '4px', whiteSpace: 'nowrap' }}>Period:</span>
        {[
          { key: 'all',    label: 'All Time' },
          { key: 'today',  label: 'Today' },
          { key: 'week',   label: 'Last 7 Days' },
          { key: 'month',  label: 'Last 30 Days' },
          { key: 'custom', label: 'Custom Range' },
        ].map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)} style={{
            padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: period === p.key ? 700 : 500,
            border: period === p.key ? '1.5px solid var(--moss)' : '1px solid var(--line-strong)',
            background: period === p.key ? 'rgba(15,107,58,0.08)' : 'transparent',
            color: period === p.key ? 'var(--moss)' : 'var(--ink)',
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>{p.label}</button>
        ))}
        {period === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--line-strong)', borderRadius: '4px', background: 'var(--paper)', color: 'var(--ink)' }} />
            <span style={{ fontSize: '11px', opacity: 0.5 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--line-strong)', borderRadius: '4px', background: 'var(--paper)', color: 'var(--ink)' }} />
          </div>
        )}
        {period !== 'all' && (
          <button onClick={() => { setPeriod('all'); setCustomFrom(''); setCustomTo(''); }}
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '4px 10px', background: 'none', border: '1px solid var(--line-strong)', borderRadius: '4px', cursor: 'pointer', opacity: 0.6 }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Sessions',  value: dateSessions.length, accent: 'var(--moss)'   },
          { label: 'Active Now',      value: activeSessions,       accent: '#16a34a'        },
          { label: 'Total Messages',  value: totalMessages,        accent: 'var(--teal)'   },
          { label: 'Avg Duration',    value: avgDuration,          accent: 'var(--accent)' },
          { label: 'Mobile Sessions', value: `${mobilePct}%`,      accent: '#6366f1'       },
        ].map(s => (
          <div key={s.label} className="metric-card" style={{ borderTop: `3px solid ${s.accent}`, padding: '12px' }}>
            <div className="metric-label">{s.label}</div>
            <div className="metric-value" style={{ fontSize: '22px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by session ID, question, device..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 34px 8px 12px', fontSize: '13px', border: '1px solid var(--line-strong)', borderRadius: '4px', background: 'var(--paper)', color: 'var(--ink)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '12px' }}>✕</button>
          )}
        </div>

        <div className="dashboard-tabs" style={{ margin: 0 }}>
          <button className={`tab-btn ${view === 'sessions' ? 'active' : ''}`} onClick={() => setView('sessions')}>
            All Sessions ({dateSessions.length})
          </button>
          <button className={`tab-btn ${view === 'chats' ? 'active' : ''}`} onClick={() => setView('chats')}>
            All Chats 💬 ({dateChats.length})
          </button>
        </div>
      </div>

      {/* ── Sessions View ─────────────────────────────────────────────── */}
      {view === 'sessions' && (
        <div className="panel compact-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {dateSessions.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>{search ? 'No sessions match your search.' : 'No session data yet.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Session ID', 'Status', 'Messages', 'Routes', 'Duration', 'Started At', 'First Question', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateSessions.map(s => (
                    <SessionRow key={s.session_id || s.id} session={s} onViewChat={() => setChatHistorySession(s)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── All Chats View ────────────────────────────────────────────── */}
      {view === 'chats' && (
        <div className="panel compact-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {chatsLoading ? (
            <div className="empty-state" style={{ padding: '40px' }}>Loading chats...</div>
          ) : dateChats.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>{search ? 'No chats match your search.' : 'No chats available.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Time', 'Route', 'Question', 'Answer'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateChats.map((c, idx) => (
                    <ChatRow key={c.id || idx} chat={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Chat History Modal ───────────────────────────────────────── */}
      {chatHistorySession && (
        <SessionChatHistory
          sessionToken={chatHistorySession.session_id}
          sessionMeta={chatHistorySession}
          onClose={() => setChatHistorySession(null)}
        />
      )}
    </div>
  );
}

// ── Session Row ───────────────────────────────────────────────────────────────

function SessionRow({ session: s, onViewChat }) {
  const shortId = (s.session_id || '').slice(0, 14);

  return (
    <tr
      style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,107,58,0.03)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '11px 14px' }}>
        <code style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.75 }}>{shortId || '—'}…</code>
        {s.department_slug && (
          <div style={{ fontSize: '10px', opacity: 0.45, marginTop: '2px' }}>{s.department_slug}</div>
        )}
      </td>
      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
        <StatusBadge status={s.status} />
        {s.device_hint && (
          <div style={{ fontSize: '10px', opacity: 0.45, marginTop: '3px' }}>
            {s.device_hint === 'mobile' ? '📱' : '🖥️'} {s.device_hint}
          </div>
        )}
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <strong style={{ fontSize: '15px' }}>{s.total_messages ?? 0}</strong>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <RouteMiniBar
          rag={s.rag_count} cache={s.cache_count}
          blocked={s.blocked_count} correction={s.correction_count}
          total={s.total_messages}
        />
      </td>
      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
        {fmtDuration(s.duration_minutes)}
      </td>
      <td style={{ padding: '11px 14px', fontSize: '12px', opacity: 0.7, whiteSpace: 'nowrap' }}>
        {toIST(s.started_at)}
        <div style={{ fontSize: '10px', opacity: 0.55 }}>{timeAgo(s.last_seen_at)}</div>
      </td>
      <td style={{ padding: '11px 14px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', opacity: 0.75 }} title={s.first_question}>
        {s.first_question || <span style={{ opacity: 0.35, fontStyle: 'italic' }}>—</span>}
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button
          onClick={onViewChat}
          style={{ padding: '4px 10px', borderRadius: '5px', background: 'rgba(15,107,58,0.1)', color: 'var(--moss)', border: '1px solid rgba(15,107,58,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          View Chat
        </button>
      </td>
    </tr>
  );
}

// ── Chat Row ──────────────────────────────────────────────────────────────────

function ChatRow({ chat }) {
  const [expanded, setExpanded] = useState(false);
  const shortQ = (chat.question || '').slice(0, 80) + ((chat.question || '').length > 80 ? '…' : '');
  const shortA = (chat.answer || '').slice(0, 100) + ((chat.answer || '').length > 100 ? '…' : '');
  const routeColor = chat.route === 'rag' ? 'var(--moss)' : chat.route?.includes('cache') ? '#2563eb' : chat.route === 'correction' ? '#7c3aed' : chat.route === 'blocked' ? '#dc2626' : '#6b7280';

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)', background: expanded ? 'rgba(15,107,58,0.04)' : 'transparent', transition: 'background 0.15s' }}>
        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: '11px', opacity: 0.65 }}>
          {new Date(chat.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {chat.route && (
            <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '10px', fontWeight: 700, background: `${routeColor}18`, color: routeColor }}>
              {chat.route}
            </span>
          )}
        </td>
        <td style={{ padding: '10px 14px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={chat.question}>{shortQ}</td>
        <td style={{ padding: '10px 14px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65 }} title={chat.answer}>{shortA}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ padding: '0 0 6px 0', background: 'rgba(15,107,58,0.02)' }}>
            <div style={{ padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ alignSelf: 'flex-end', background: 'rgba(15,107,58,0.1)', padding: '10px 14px', borderRadius: '12px 12px 0 12px', fontSize: '13px', maxWidth: '85%' }}>
                <strong>Q:</strong> {chat.question}
              </div>
              <div style={{ alignSelf: 'flex-start', background: 'var(--paper)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px', maxWidth: '85%', whiteSpace: 'pre-wrap' }}>
                <strong>Bot:</strong> {chat.answer}
              </div>
              {chat.response_time_ms && (
                <div style={{ fontSize: '11px', opacity: 0.5 }}>Latency: {Math.round(chat.response_time_ms)} ms</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

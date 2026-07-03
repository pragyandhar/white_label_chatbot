import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../utils/api';
import SessionChatHistory from '../SessionChatHistory';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toIST(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
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

function DeviceIcon({ device }) {
  return device === 'Mobile' ? '📱' : '🖥️';
}

function BrowserBadge({ browser }) {
  const colors = {
    Chrome:  { bg: 'rgba(234,67,53,0.1)',   color: '#ea4335' },
    Firefox: { bg: 'rgba(255,149,0,0.1)',   color: '#ff9500' },
    Safari:  { bg: 'rgba(0,122,255,0.1)',   color: '#007aff' },
    Edge:    { bg: 'rgba(0,164,228,0.1)',   color: '#00a4e4' },
    Opera:   { bg: 'rgba(255,30,0,0.1)',    color: '#ff1e00' },
    IE:      { bg: 'rgba(0,100,200,0.1)',   color: '#0064c8' },
    Other:   { bg: 'rgba(0,0,0,0.06)',      color: '#666'    },
    Unknown: { bg: 'rgba(0,0,0,0.06)',      color: '#999'    },
  };
  const style = colors[browser] || colors.Other;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
      background: style.bg, color: style.color,
    }}>
      {browser}
    </span>
  );
}

// ── Visitor Row ───────────────────────────────────────────────────────────────

function VisitorRow({ visitor, sessions, onViewChat }) {
  const [expanded, setExpanded] = useState(false);

  const ownSessions = useMemo(
    () => sessions.filter(
      s => (s.visitor_id || s.session_token?.slice(0, 8)) === visitor.visitor_id
    ),
    [sessions, visitor.visitor_id]
  );

  const shortId = (visitor.visitor_id || '').slice(0, 12);
  const countryLabel = visitor.countries?.length ? visitor.countries[0] : '🌐 Unknown';

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', background: expanded ? 'rgba(15,107,58,0.04)' : 'transparent', transition: 'background 0.15s' }}
        className="collapsible-row"
      >
        <td style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: visitor.open_count > 0 ? 'var(--moss)' : 'var(--line-strong)', flexShrink: 0,
            }} />
            <code style={{ fontSize: '12px', fontFamily: 'monospace', opacity: 0.85 }}>{shortId || '—'}</code>
          </div>
        </td>
        <td style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>{countryLabel}</div>
          <div style={{ fontSize: '11px', opacity: 0.55 }}>
            {visitor.ips?.[0] || '—'}{visitor.ips?.length > 1 && ` +${visitor.ips.length - 1}`}
          </div>
        </td>
        <td style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DeviceIcon device={ownSessions[0]?.device || 'Desktop'} />
            <BrowserBadge browser={ownSessions[0]?.browser || 'Unknown'} />
          </div>
          <div style={{ fontSize: '11px', opacity: 0.55, marginTop: '3px' }}>{ownSessions[0]?.os || '—'}</div>
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
          <span style={{
            display: 'inline-block', padding: '3px 12px', borderRadius: '99px',
            background: 'rgba(15,107,58,0.10)', color: 'var(--moss)', fontWeight: 700, fontSize: '13px',
          }}>{visitor.open_count}×</span>
        </td>
        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>{visitor.total_messages}</span>
        </td>
        <td style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500 }}>{timeAgo(visitor.last_seen)}</div>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>{toIST(visitor.first_seen)}</div>
        </td>
        <td style={{ padding: '12px 14px', maxWidth: '180px' }}>
          {visitor.referrers?.length ? (
            <span style={{ fontSize: '11px', opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={visitor.referrers.join(', ')}>
              {visitor.referrers[0]}
            </span>
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.35 }}>Direct</span>
          )}
        </td>
        <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '12px', opacity: 0.45 }}>{expanded ? '▲' : '▼'}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0 0 4px 0', background: 'rgba(15,107,58,0.03)' }}>
            <div style={{ padding: '12px 24px 16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5, marginBottom: '10px' }}>
                {ownSessions.length} session{ownSessions.length !== 1 ? 's' : ''} for this visitor
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ownSessions.map(s => (
                  <div key={s.id} style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 0.7fr auto',
                    gap: '8px', padding: '10px 14px', borderRadius: '6px',
                    background: 'var(--paper)', border: '1px solid var(--line)', fontSize: '12px', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ opacity: 0.5, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Session ID</div>
                      <code style={{ fontFamily: 'monospace', fontSize: '11px' }}>{(s.session_token || '').slice(0, 14)}</code>
                    </div>
                    <div>
                      <div style={{ opacity: 0.5, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Started</div>
                      <div>{toIST(s.started_at)}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.5, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Duration</div>
                      <div style={{ fontWeight: 600 }}>{s.duration_label || '—'}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.5, fontSize: '10px', textTransform: 'uppercase', marginBottom: '2px' }}>Messages</div>
                      <div style={{ fontWeight: 600 }}>{s.total_messages ?? 0}</div>
                    </div>
                    <div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewChat && onViewChat(s); }}
                        style={{
                          padding: '5px 10px', borderRadius: '6px',
                          background: 'rgba(15,107,58,0.1)', color: 'var(--moss)',
                          border: '1px solid rgba(15,107,58,0.2)', cursor: 'pointer',
                          fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                      >
                        View Chat
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Date Range Filter Helpers ─────────────────────────────────────────────────

function getPeriodRange(period) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return { from: todayStart, to: null };
  if (period === 'week') { const from = new Date(todayStart); from.setDate(from.getDate() - 6); return { from, to: null }; }
  if (period === 'month') { const from = new Date(todayStart); from.setDate(from.getDate() - 29); return { from, to: null }; }
  return null;
}

// ── Main Tab ───────────────────────────────────────────────────────────────────

export function VisitorSessionsTab() {
  const [data, setData] = useState(null);
  const [allChats, setAllChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('visitors'); // 'visitors' | 'sessions' | 'chats'
  const [chatHistorySession, setChatHistorySession] = useState(null);
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/admin/sessions', { headers: { 'X-Admin-User': 'dashboard-admin' } })
      .then(sessionsData => { setData(sessionsData); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view === 'chats' && allChats.length === 0 && !chatsLoading) {
      setChatsLoading(true);
      apiFetch('/api/admin/chats?limit=500', { headers: { 'X-Admin-User': 'dashboard-admin' } })
        .then(d => setAllChats(d.chats || []))
        .catch(() => {})
        .finally(() => setChatsLoading(false));
    }
  }, [view]);

  const visitors = data?.visitors || [];
  const sessions = data?.sessions || [];

  const filteredVisitors = useMemo(() => {
    if (!search.trim()) return visitors;
    const q = search.toLowerCase();
    return visitors.filter(v =>
      (v.visitor_id || '').toLowerCase().includes(q) ||
      (v.ips || []).some(ip => ip.includes(q)) ||
      (v.countries || []).some(c => c.toLowerCase().includes(q))
    );
  }, [visitors, search]);

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      (s.visitor_id || '').toLowerCase().includes(q) ||
      (s.ip_address || '').includes(q) ||
      (s.browser || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const filteredChats = useMemo(() => {
    if (!search.trim()) return allChats;
    const q = search.toLowerCase();
    return allChats.filter(c =>
      (c.question || '').toLowerCase().includes(q) ||
      (c.answer || '').toLowerCase().includes(q) ||
      (c.session_token || '').toLowerCase().includes(q)
    );
  }, [allChats, search]);

  const applyDateFilter = (items, dateField) => {
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
  };

  const dateFilteredVisitors = useMemo(() => applyDateFilter(filteredVisitors, 'last_seen'), [filteredVisitors, period, customFrom, customTo]);
  const dateFilteredSessions = useMemo(() => applyDateFilter(filteredSessions, 'started_at'), [filteredSessions, period, customFrom, customTo]);
  const dateFilteredChats = useMemo(() => applyDateFilter(filteredChats, 'asked_at'), [filteredChats, period, customFrom, customTo]);

  const activeVisitors = period === 'all' ? visitors : dateFilteredVisitors;
  const activeSessions = period === 'all' ? sessions : dateFilteredSessions;
  const totalVisitors = activeVisitors.length;
  const totalSessions = activeSessions.length;
  const totalMessages = activeVisitors.reduce((acc, v) => acc + (v.total_messages || 0), 0);
  const mobileCount = activeSessions.filter(s => s.device === 'Mobile').length;
  const mobilePct = totalSessions > 0 ? Math.round((mobileCount / totalSessions) * 100) : 0;
  const returningVisitors = activeVisitors.filter(v => v.open_count > 1).length;

  if (loading) return <div className="empty-state" style={{ padding: '60px' }}>Loading visitor sessions...</div>;
  if (error) return <div className="empty-state" style={{ color: 'var(--danger)', padding: '40px' }}>Error: {error}</div>;

  return (
    <div className="fade-in tab-content-inner">

      {/* ── Period Filter Bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        marginBottom: '16px', padding: '10px 14px',
        background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '8px',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5, marginRight: '4px', whiteSpace: 'nowrap' }}>
          Period:
        </span>
        {[{ key: 'all', label: 'All Time' }, { key: 'today', label: 'Today' }, { key: 'week', label: 'Last 7 Days' }, { key: 'month', label: 'Last 30 Days' }, { key: 'custom', label: 'Custom Range' }].map(p => (
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
            ✕ Clear Filter
          </button>
        )}
      </div>

      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Unique Visitors',    value: totalVisitors,     accent: 'var(--moss)'   },
          { label: 'Total Sessions',     value: totalSessions,     accent: 'var(--teal)'   },
          { label: 'Returning Visitors', value: returningVisitors, accent: 'var(--accent)' },
          { label: 'Total Messages',     value: totalMessages,     accent: 'var(--forest)' },
          { label: 'Mobile Users',       value: `${mobilePct}%`,  accent: '#6366f1'       },
        ].map(s => (
          <div key={s.label} className="metric-card" style={{ borderTop: `3px solid ${s.accent}`, padding: '12px' }}>
            <div className="metric-label">{s.label}</div>
            <div className="metric-value" style={{ fontSize: '22px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by visitor ID, IP, country, question..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 34px 8px 12px', fontSize: '13px', border: '1px solid var(--line-strong)', borderRadius: '4px', background: 'var(--paper)', color: 'var(--ink)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '12px' }}>✕</button>
          )}
        </div>

        <div className="dashboard-tabs" style={{ margin: 0 }}>
          <button className={`tab-btn ${view === 'visitors' ? 'active' : ''}`} onClick={() => setView('visitors')}>
            By Visitor ({dateFilteredVisitors.length})
          </button>
          <button className={`tab-btn ${view === 'sessions' ? 'active' : ''}`} onClick={() => setView('sessions')}>
            All Sessions ({dateFilteredSessions.length})
          </button>
          <button className={`tab-btn ${view === 'chats' ? 'active' : ''}`} onClick={() => setView('chats')}>
            All Chats 💬 ({dateFilteredChats.length})
          </button>
        </div>
      </div>

      {/* ── Visitor View ────────────────────────────────────────────────── */}
      {view === 'visitors' && (
        <div className="panel compact-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {dateFilteredVisitors.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>{search ? 'No visitors match your search.' : 'No visitor data available.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Visitor ID', 'Location', 'Browser / Device', 'Times Opened', 'Messages', 'Last Seen', 'Referrer', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55, textAlign: h === 'Times Opened' || h === 'Messages' ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateFilteredVisitors.map(v => (
                    <VisitorRow key={v.visitor_id} visitor={v} sessions={sessions} onViewChat={setChatHistorySession} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sessions View ───────────────────────────────────────────────── */}
      {view === 'sessions' && (
        <div className="panel compact-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {dateFilteredSessions.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>{search ? 'No sessions match your search.' : 'No session data available.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Session', 'IP Address', 'Location', 'Browser', 'Device', 'Messages', 'Duration', 'Started At', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateFilteredSessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <code style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.75 }}>{(s.session_token || '').slice(0, 10)}…</code>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{s.ip_address || '—'}</span>
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        {s.geo_flag} {s.geo_city !== 'Unknown' ? s.geo_city : ''} {s.geo_country}
                      </td>
                      <td style={{ padding: '11px 14px' }}><BrowserBadge browser={s.browser || 'Unknown'} /></td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}><DeviceIcon device={s.device} /> {s.device}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600 }}>{s.total_messages ?? 0}</td>
                      <td style={{ padding: '11px 14px' }}>{s.duration_label}</td>
                      <td style={{ padding: '11px 14px', fontSize: '12px', opacity: 0.7 }}>{toIST(s.started_at)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <button
                          onClick={() => setChatHistorySession(s)}
                          style={{ padding: '4px 10px', borderRadius: '5px', background: 'rgba(15,107,58,0.1)', color: 'var(--moss)', border: '1px solid rgba(15,107,58,0.2)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                        >
                          View Chat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── All Chats View ──────────────────────────────────────────────── */}
      {view === 'chats' && (
        <div className="panel compact-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {chatsLoading ? (
            <div className="empty-state" style={{ padding: '40px' }}>Loading chats...</div>
          ) : dateFilteredChats.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>{search ? 'No chats match your search.' : 'No chats available.'}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    {['Session', 'Time', 'Route', 'Question', 'Answer'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.55, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dateFilteredChats.map((c, idx) => (
                    <ChatRow key={c.id || idx} chat={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {chatHistorySession && (
        <SessionChatHistory sessionToken={chatHistorySession.session_token} sessionMeta={chatHistorySession} onClose={() => setChatHistorySession(null)} />
      )}
    </div>
  );
}

// ── Chat Row ─────────────────────────────────────────────────────────────────
function ChatRow({ chat }) {
  const [expanded, setExpanded] = useState(false);
  const shortSession = (chat.session_token || '').slice(0, 10);
  const shortQ = (chat.question || '').slice(0, 80) + ((chat.question || '').length > 80 ? '…' : '');
  const shortA = (chat.answer || '').slice(0, 100) + ((chat.answer || '').length > 100 ? '…' : '');
  const routeColor = chat.route === 'rag' ? 'var(--moss)' : chat.route?.includes('fee') ? '#f59e0b' : '#6366f1';

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)', background: expanded ? 'rgba(15,107,58,0.04)' : 'transparent', transition: 'background 0.15s' }}
      >
        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
          <code style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.75 }}>{shortSession}…</code>
        </td>
        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: '11px', opacity: 0.65 }}>
          {new Date(chat.asked_at || chat.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
          <td colSpan={5} style={{ padding: '0 0 6px 0', background: 'rgba(15,107,58,0.02)' }}>
            <div style={{ padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ alignSelf: 'flex-end', background: 'rgba(15,107,58,0.1)', color: 'var(--ink)', padding: '10px 14px', borderRadius: '12px 12px 0 12px', fontSize: '13px', maxWidth: '85%' }}>
                <strong>Q:</strong> {chat.question}
              </div>
              <div style={{ alignSelf: 'flex-start', background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)', padding: '10px 14px', borderRadius: '12px 12px 12px 0', fontSize: '13px', maxWidth: '85%', whiteSpace: 'pre-wrap' }}>
                <strong>Bot:</strong> {chat.answer}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

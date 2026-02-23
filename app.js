// ============================================================
//  DEBUGARENA v3 — app.js  (Supabase Edition)
//
//  ⚠️  SETUP (do this once):
//  1. Go to Supabase → SQL Editor → paste & run supabase_setup.sql
//  2. Replace SUPABASE_KEY below with your full Publishable Key
//     (Supabase → Settings → API → Publishable Key)
// ============================================================

let SUPABASE_URL = 'https://jlexzkwdozcgwmxckamy.supabase.co';
let SUPABASE_KEY = 'sb_publishable_dwP6SLgaOREualDV8IKfgA_WpBtwiJj'; // ← from your Supabase dashboard

function _getStoredSupabaseConfig() {
  try {
    const raw = localStorage.getItem('da_supabase');
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return null;
    if (typeof cfg.url !== 'string' || typeof cfg.key !== 'string') return null;
    if (!cfg.url.trim() || !cfg.key.trim()) return null;
    return { url: cfg.url.trim(), key: cfg.key.trim() };
  } catch {
    return null;
  }
}

(function _initSupabaseConfig() {
  const cfg = _getStoredSupabaseConfig();
  if (cfg) {
    SUPABASE_URL = cfg.url;
    SUPABASE_KEY = cfg.key;
  }
})();

// Lazy Supabase client — loaded from CDN <script> in each HTML page
const _supa = {
  _c: null,
  _blocked: false,
  get() {
    if (this._blocked) throw new Error('Supabase disabled (auth failed).');
    if (!this._c) this._c = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return this._c;
  },
  reset() {
    this._c = null;
    this._blocked = false;
  }
};

let _dbAuthFailed = false;
function _handleDbError(error) {
  if (!error) return;
  const status = error.status || error?.cause?.status;
  const is401 = status === 401 || error.code === 401;
  if (!is401) return;
  if (_dbAuthFailed) return;
  _dbAuthFailed = true;
  _supa._blocked = true;
  const msg = 'Supabase auth failed (401). Update the publishable/anon key and reload. You can set localStorage key da_supabase = {"url":"...","key":"..."}';
  try {
    if (typeof Toast !== 'undefined' && Toast?.show) Toast.show(msg, 'error', 12000);
  } catch {}
  console.error(msg, error);
}

window.DA = window.DA || {};
window.DA.setSupabaseConfig = function (url, key) {
  if (typeof url !== 'string' || typeof key !== 'string') throw new Error('Invalid Supabase config');
  const cfg = { url: url.trim(), key: key.trim() };
  if (!cfg.url || !cfg.key) throw new Error('Invalid Supabase config');
  localStorage.setItem('da_supabase', JSON.stringify(cfg));
  SUPABASE_URL = cfg.url;
  SUPABASE_KEY = cfg.key;
  _dbAuthFailed = false;
  _supa.reset();
  return true;
};

// ── ROW MAPPERS ───────────────────────────────────────────────
function _mapProblem(r) {
  if (!r) return null;
  return {
    id: r.id, language: r.language, round: r.round,
    title: r.title, buggyCode: r.buggy_code, expectedOutput: r.expected_output,
    difficulty: r.difficulty, timeLimit: r.time_limit, hint: r.hint,
    status: r.status, createdAt: r.created_at,
  };
}
function _mapPart(r) {
  if (!r) return null;
  return {
    username: r.username,
    round1Status: r.round1_status || 'pending', round1Lang: r.round1_lang || null,
    round1Completed: r.round1_completed || 0, round2Eligible: r.round2_eligible || false,
    round2Status: r.round2_status || 'pending', round2Lang: r.round2_lang || null,
    round2Completed: r.round2_completed || 0, joinedAt: r.joined_at,
  };
}
function _mapSub(r) {
  if (!r) return null;
  return {
    id: r.id, participantName: r.participant_name, problemId: r.problem_id,
    round: r.round, submittedCode: r.submitted_code, actualOutput: r.actual_output,
    result: r.result, timeTaken: r.time_taken, terminated: r.terminated,
    adminReviewed: r.admin_reviewed, adminScore: r.admin_score,
    adminComment: r.admin_comment, createdAt: r.created_at,
  };
}

// ============================================================
//  DB — async Supabase operations
// ============================================================
const DB = {

  // ── PROBLEMS ──────────────────────────────────────────────
  async getProblems() {
    const { data, error } = await _supa.get().from('problems').select('*')
      .order('created_at', { ascending: true });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return (data || []).map(_mapProblem);
  },

  async getProblem(id) {
    const { data, error } = await _supa.get().from('problems').select('*')
      .eq('id', id).single();
    if (error) { _handleDbError(error); return null; }
    return _mapProblem(data);
  },

  async addProblem(prob) {
    const { data, error } = await _supa.get().from('problems').insert([{
      language: prob.language, round: prob.round || 1, title: prob.title,
      buggy_code: prob.buggyCode, expected_output: prob.expectedOutput,
      difficulty: prob.difficulty || 'Medium', time_limit: prob.timeLimit || null,
      hint: prob.hint || null, status: 'active',
    }]).select().single();
    if (error) { _handleDbError(error); Toast.show('DB Error: ' + error.message, 'error'); return null; }
    return _mapProblem(data);
  },

  async deleteProblem(id) {
    const { error } = await _supa.get().from('problems').delete().eq('id', id);
    if (error) { _handleDbError(error); Toast.show('Delete failed: ' + error.message, 'error'); }
  },

  async toggleProblem(id) {
    const { data: cur, error: curErr } = await _supa.get().from('problems').select('status')
      .eq('id', id).single();
    if (curErr) { _handleDbError(curErr); return null; }
    const s = cur?.status === 'active' ? 'inactive' : 'active';
    const { data, error } = await _supa.get().from('problems').update({ status: s })
      .eq('id', id).select().single();
    if (error) { _handleDbError(error); return null; }
    return _mapProblem(data);
  },

  // ── PARTICIPANTS ───────────────────────────────────────────
  async getParticipants() {
    const { data, error } = await _supa.get().from('participants').select('*')
      .order('joined_at', { ascending: true });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return (data || []).map(_mapPart);
  },

  async getParticipant(username) {
    const { data, error } = await _supa.get().from('participants').select('*')
      .eq('username', username).single();
    if (error) { _handleDbError(error); return null; }
    return data ? _mapPart(data) : null;
  },

  async registerParticipant(username) {
    const { data: ex } = await _supa.get().from('participants').select('*')
      .eq('username', username).single();
    if (ex) return _mapPart(ex);
    const { data, error } = await _supa.get().from('participants')
      .insert([{ username }]).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return _mapPart(data);
  },

  async updateParticipant(username, updates) {
    const row = {};
    const map = {
      round1Lang: 'round1_lang', round1Status: 'round1_status',
      round1Completed: 'round1_completed', round2Eligible: 'round2_eligible',
      round2Lang: 'round2_lang', round2Status: 'round2_status',
      round2Completed: 'round2_completed',
    };
    Object.keys(updates).forEach(k => { if (map[k]) row[map[k]] = updates[k]; });
    const { data, error } = await _supa.get().from('participants')
      .update(row).eq('username', username).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return _mapPart(data);
  },

  async deleteParticipant(username) {
    const { error } = await _supa.get().from('participants').delete().eq('username', username);
    if (error) _handleDbError(error);
  },

  // ── SUBMISSIONS ────────────────────────────────────────────
  async getSubmissions() {
    const { data, error } = await _supa.get().from('submissions').select('*')
      .order('created_at', { ascending: false });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return (data || []).map(_mapSub);
  },

  async getMySubmissions(username) {
    const { data, error } = await _supa.get().from('submissions').select('*')
      .eq('participant_name', username).order('created_at', { ascending: false });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return (data || []).map(_mapSub);
  },

  async addSubmission(sub) {
    const { data, error } = await _supa.get().from('submissions').insert([{
      participant_name: sub.participantName, problem_id: sub.problemId || null,
      round: sub.round || 1, submitted_code: sub.submittedCode || '',
      actual_output: sub.actualOutput || '', result: sub.result,
      time_taken: sub.timeTaken || '', terminated: sub.terminated || false,
    }]).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return _mapSub(data);
  },

  // ── ADMIN SUBMISSIONS (Code Review) ───────────────────────
  async getAdminSubmissions() {
    const { data, error } = await _supa.get().from('admin_submissions').select('*')
      .order('submitted_at', { ascending: false });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return data || [];
  },

  async getMyAdminReviews(username) {
    const { data, error } = await _supa.get().from('admin_submissions').select('*')
      .eq('participant_name', username)
      .order('reviewed_at', { ascending: false })
      .order('submitted_at', { ascending: false });
    if (error) { _handleDbError(error); console.error(error); return []; }
    return data || [];
  },

  async addAdminSubmission(sub) {
    const { data, error } = await _supa.get().from('admin_submissions').insert([{
      participant_name: sub.participantName, problem_id: sub.problemId || null,
      problem_title: sub.problemTitle || '', language: sub.language || '',
      round: sub.round || 1, submitted_code: sub.submittedCode || '',
      actual_output: sub.actualOutput || '', expected_output: sub.expectedOutput || '',
      result: sub.result, time_taken: sub.timeTaken || '',
    }]).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return data;
  },

  async reviewAdminSubmission(id, score, comment) {
    const { data, error } = await _supa.get().from('admin_submissions').update({
      admin_reviewed: true, admin_score: score, admin_comment: comment,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return data;
  },

  async applyReviewToLatestSubmission(participantName, problemId, round, score, comment) {
    const base = _supa.get().from('submissions').select('id, problem_id, round, created_at')
      .eq('participant_name', participantName)
      .eq('round', round)
      .order('created_at', { ascending: false });

    // Prefer exact problem match when possible
    let sub = null;
    if (problemId) {
      const { data, error } = await base.eq('problem_id', problemId).limit(1).maybeSingle();
      if (!error && data) sub = data;
      if (error) { _handleDbError(error); console.error(error); }
    }

    // Fallback: latest submission in the round (covers any schema mismatch / null problem_id)
    if (!sub) {
      const { data, error } = await base.limit(1).maybeSingle();
      if (error) { _handleDbError(error); console.error(error); return null; }
      sub = data;
    }

    if (!sub?.id) return null;
    const { data, error } = await _supa.get().from('submissions').update({
      admin_reviewed: true,
      admin_score: score,
      admin_comment: comment,
    }).eq('id', sub.id).select().single();
    if (error) { _handleDbError(error); console.error(error); return null; }
    return _mapSub(data);
  },

  // ── ROUND STATE ────────────────────────────────────────────
  async getRoundState() {
    const { data, error } = await _supa.get().from('round_state').select('*')
      .eq('id', 1).single();
    if (error) { _handleDbError(error); return { round1Open: false, round2Open: false, round1TimeLimit: 30, round2TimeLimit: 45 }; }
    return {
      round1Open: data.round1_open ?? false, round2Open: data.round2_open ?? false,
      round1TimeLimit: data.round1_time_limit ?? 30, round2TimeLimit: data.round2_time_limit ?? 45,
    };
  },

  async saveRoundState(state) {
    const { error } = await _supa.get().from('round_state').upsert([{
      id: 1, round1_open: state.round1Open, round2_open: state.round2Open,
      round1_time_limit: state.round1TimeLimit, round2_time_limit: state.round2TimeLimit,
    }], { onConflict: 'id' });
    if (error) { _handleDbError(error); Toast.show('Save failed: ' + error.message, 'error'); }
  },
};

// ============================================================
//  AUTH
// ============================================================
const Auth = {
  check(required) {
    const role = sessionStorage.getItem('da_role');
    const user = sessionStorage.getItem('da_user');
    if (!role || !user) { window.location.href = 'index.html'; return false; }
    if (required && role !== required) { window.location.href = 'index.html'; return false; }
    return true;
  },
  role()   { return sessionStorage.getItem('da_role'); },
  user()   { return sessionStorage.getItem('da_user'); },
  logout() { sessionStorage.clear(); window.location.href = 'index.html'; },
};

// ============================================================
//  TOAST
// ============================================================
const Toast = {
  show(msg, type = 'success', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type] || '📢'}</span><span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.cssText += 'opacity:0;transition:opacity 0.4s;';
      setTimeout(() => t.remove(), 400);
    }, duration);
  }
};

// ============================================================
//  UTILS
// ============================================================
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN',
    { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}
function truncate(s, n = 80) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); }
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(sec) { return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`; }

function showLoading(msg = 'Loading…') {
  let el = document.getElementById('_gloader');
  if (!el) {
    el = document.createElement('div'); el.id = '_gloader';
    el.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(8,12,16,0.92);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:28px;';
    el.innerHTML = `
      <div class="loader-container">
        <div class="loader-box box-1" style="background:#00f5a0;"></div>
        <div class="loader-box box-2" style="background:#00ffd5;"></div>
        <div class="loader-box box-3" style="background:#00d4ff;"></div>
        <div class="loader-box box-4" style="background:#ff2d55;"></div>
      </div>
      <div id="_gloader_msg" style="font-family:var(--font-mono,monospace);font-size:13px;color:var(--neon,#00f5a0);letter-spacing:3px;text-transform:uppercase;font-weight:700;text-shadow:0 0 10px rgba(0,245,160,0.4);">${escapeHtml(msg)}</div>
    `;
    document.body.appendChild(el);
  } else {
    const m = document.getElementById('_gloader_msg');
    if (m) m.textContent = msg;
    el.style.display = 'flex';
  }
}
function hideLoading() {
  const el = document.getElementById('_gloader');
  if (el) el.style.display = 'none';
}
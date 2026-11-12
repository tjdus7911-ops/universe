// 계정·저장 — PHASE 0 시안용 '로컬 계정'
// 서버·DB가 아직 없으므로 이 브라우저(localStorage)에만 저장한다. 다른 기기와 동기화되지 않는다.
// 비밀번호는 저장하지 않고, 무작위 솔트를 붙인 PBKDF2-SHA256 해시만 남긴다.
// PHASE 4에서는 같은 함수 이름(signup·login·logout·restore·save)을 서버 REST API로 바꿔 끼운다.
//   signup  → POST /auth/signup     login → POST /auth/login     logout → POST /auth/logout
//   restore → GET  /me              save  → PUT  /me/profile, PUT /me/progress
const KEY = 'sv.accounts.v1';
const SESSION = 'sv.session.v1';
const ITER = 150000;

let mem = { accounts: {}, session: null };
let storageOk = true;
function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    storageOk = false;
    return mem.accounts;
  }
}
function writeAll(all) {
  mem.accounts = all;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { storageOk = false; }
}
function readSession() {
  try { return localStorage.getItem(SESSION); } catch { storageOk = false; return mem.session; }
}
function writeSession(v) {
  mem.session = v;
  try {
    if (v) localStorage.setItem(SESSION, v);
    else localStorage.removeItem(SESSION);
  } catch { storageOk = false; }
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return hex(bits);
}
const normEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const account = {
  user: null, // { id, email, name }
  get storageOk() { return storageOk; },
  get canHash() { return !!(globalThis.crypto && crypto.subtle); },
  isMember() { return !!this.user; },

  validate({ email, password, password2, name }, mode) {
    if (!EMAIL_RE.test(normEmail(email))) return '이메일 형식을 확인해 주세요';
    if (!password || password.length < 8) return '비밀번호는 8자 이상이어야 해요';
    if (mode === 'signup') {
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '비밀번호에 영문과 숫자를 함께 넣어 주세요';
      if (password !== password2) return '비밀번호 확인이 일치하지 않아요';
      const n = String(name || '').trim();
      if (n.length < 2 || n.length > 12) return '닉네임은 2~12자로 정해 주세요';
    }
    return null;
  },

  async signup({ email, password, password2, name }) {
    const err = this.validate({ email, password, password2, name }, 'signup');
    if (err) return { ok: false, error: err };
    if (!this.canHash) return { ok: false, error: '이 브라우저에서는 안전하게 저장할 수 없어요 (https 필요)' };
    const all = readAll();
    const em = normEmail(email);
    const nm = String(name).trim();
    if (all[em]) return { ok: false, error: '이미 가입된 이메일이에요. 로그인해 주세요' };
    if (Object.values(all).some((a) => a.name.toLowerCase() === nm.toLowerCase())) return { ok: false, error: '이미 쓰고 있는 닉네임이에요' };
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(password, salt);
    const id = hex(crypto.getRandomValues(new Uint8Array(8)));
    all[em] = { id, email: em, name: nm, salt, hash, iter: ITER, created: new Date().toISOString(), data: null };
    writeAll(all);
    writeSession(em);
    this.user = { id, email: em, name: nm };
    return { ok: true, user: this.user, data: null };
  },

  async login({ email, password }) {
    const err = this.validate({ email, password }, 'login');
    if (err) return { ok: false, error: err };
    if (!this.canHash) return { ok: false, error: '이 브라우저에서는 로그인할 수 없어요 (https 필요)' };
    const all = readAll();
    const a = all[normEmail(email)];
    // 어느 쪽이 틀렸는지 알려 주지 않는다 (계정 존재 여부 노출 방지)
    if (!a) return { ok: false, error: '이메일 또는 비밀번호가 맞지 않아요' };
    const hash = await hashPassword(password, a.salt);
    if (hash !== a.hash) return { ok: false, error: '이메일 또는 비밀번호가 맞지 않아요' };
    writeSession(a.email);
    this.user = { id: a.id, email: a.email, name: a.name };
    return { ok: true, user: this.user, data: a.data };
  },

  logout() {
    writeSession(null);
    this.user = null;
  },

  // 새로고침·재접속 시 로그인 상태와 저장 데이터 복원
  restore() {
    const em = readSession();
    if (!em) return null;
    const a = readAll()[em];
    if (!a) { writeSession(null); return null; }
    this.user = { id: a.id, email: a.email, name: a.name };
    return { user: this.user, data: a.data };
  },

  // 아바타·진행 상태 저장 (회원만). 비회원은 저장하지 않는다.
  save(data) {
    if (!this.user) return false;
    const all = readAll();
    const a = all[this.user.email];
    if (!a) return false;
    a.data = { ...data, savedAt: new Date().toISOString() };
    writeAll(all);
    return storageOk;
  },
};

/**
 * 책마루 성장기록 게시판 v2
 * ─────────────────────────────────────────────
 * ✅ Supabase 실시간 DB 연동 (posts, notices, comments, likes 테이블)
 * ✅ Supabase Storage 사진 업로드
 * ✅ 선생님 전용 공지 작성 (비밀번호 보호)
 * ─────────────────────────────────────────────
 * 📌 사용 전 설정:
 *   1. supabase.com 에서 프로젝트 생성
 *   2. 아래 SUPABASE_URL, SUPABASE_ANON_KEY 를 본인 값으로 교체
 *   3. SQL Editor에서 하단 주석의 테이블 생성 SQL 실행
 *   4. Storage > New bucket "bookmaru-photos" 생성 (Public)
 */

import { useState, useEffect, useRef } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ──────────────────────────────────────────────
// 🔧 여기에 본인 Supabase 정보 입력
// ──────────────────────────────────────────────
const SUPABASE_URL = "https://hpyopntcjsuobgbmnrhb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhweW9wbnRjanN1b2JnYm1ucmhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMjI5MDcsImV4cCI6MjA5Mzg5ODkwN30.PueD98XjdiSKI0MC-sp4ax7sbjX4K3DwBUJXf6Psqq0";
const TEACHER_PASSWORD = "bookmaru2025"; // 선생님 비밀번호 (원하는 대로 변경)
const STORAGE_BUCKET = "bookmaru-photos";

/*
──────────────────────────────────────────────
📋 Supabase SQL Editor에 붙여넣기 (테이블 생성)
──────────────────────────────────────────────

create table notices (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  content text not null,
  pinned boolean default false,
  created_at timestamptz default now()
);

create table posts (
  id uuid default gen_random_uuid() primary key,
  author text not null,
  grade text,
  type text not null,
  content text not null,
  image_url text,
  emoji text,
  created_at timestamptz default now()
);

create table comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz default now()
);

create table likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references posts(id) on delete cascade,
  session_id text not null,
  unique(post_id, session_id)
);

-- RLS 비활성화 (간단 운영용, 실서비스는 정책 설정 권장)
alter table notices disable row level security;
alter table posts disable row level security;
alter table comments disable row level security;
alter table likes disable row level security;

──────────────────────────────────────────────
*/

// ──────────────────────────────────────────────
// 상수 & 유틸
// ──────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 브라우저 세션 ID (좋아요 중복 방지용)
const SESSION_ID = (() => {
  let s = localStorage.getItem("bm_session");
  if (!s) { s = Math.random().toString(36).slice(2); localStorage.setItem("bm_session", s); }
  return s;
})();

// 데모용 mock 데이터 (Supabase 미연결 시 폴백)
const MOCK_NOTICES = [
  { id: "n1", title: "📢 5월 독서왕 발표!", content: "이번 달 독서왕은 총 8권을 읽은 이서연 학생입니다! 6월에도 함께 열심히 읽어봐요.", pinned: true, created_at: "2025-05-08T09:00:00Z" },
  { id: "n2", title: "🏃 5월 새벽운동 일정 안내", content: "5월 새벽 운동은 매주 월/수/금 오전 6시입니다. 꾸준히 참여한 학생에게 특별 보상이 있습니다.", pinned: false, created_at: "2025-05-05T09:00:00Z" },
];
const MOCK_POSTS = [
  { id: "p1", author: "이서연", grade: "중3", type: "독서", content: "오늘 '아몬드' 다 읽었어요! 감동적이었어요 📚", image_url: null, emoji: "📖", created_at: "2025-05-08T10:00:00Z", _likes: 5, _liked: false, _comments: [{ id: "c1", author: "박준호", text: "서연아 대단하다!!", created_at: "2025-05-08T11:00:00Z" }] },
  { id: "p2", author: "박준호", grade: "중2", type: "운동", content: "새벽 6시 운동 완료! 운동장 10바퀴 돌았어요 💪", image_url: null, emoji: "🏃", created_at: "2025-05-08T07:00:00Z", _likes: 8, _liked: false, _comments: [] },
  { id: "p3", author: "최유나", grade: "중1", type: "습관", content: "물 2L 마시기 30일 연속 달성!! 🥤", image_url: null, emoji: "💧", created_at: "2025-05-07T20:00:00Z", _likes: 12, _liked: false, _comments: [{ id: "c2", author: "책마루 선생님", text: "30일이면 진짜 습관이 된 거예요! 👏" }] },
];

const ORANGE = "#F97316";
const ORANGE_LIGHT = "#FFF7ED";
const ORANGE_MID = "#FED7AA";
const IVORY = "#FDFAF5";
const BROWN = "#78350F";
const GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";

const TYPE_META = {
  독서: { emoji: "📖", bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
  운동: { emoji: "🏃", bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0" },
  일과: { emoji: "📝", bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  습관: { emoji: "💧", bg: "#FDF4FF", text: "#7E22CE", border: "#E9D5FF" },
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1) return "방금 전";
  if (diff < 60) return `${diff}분 전`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const avatarColor = (name) => {
  const palette = ["#FB923C", "#34D399", "#60A5FA", "#F472B6", "#A78BFA", "#FBBF24"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % palette.length;
  return palette[h];
};

// ──────────────────────────────────────────────
// 공통 컴포넌트
// ──────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const isTeacher = name === "책마루 선생님";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: isTeacher ? ORANGE : avatarColor(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: "700", fontSize: size * 0.38,
      fontFamily: "'Noto Sans KR', sans-serif",
      border: isTeacher ? `2px solid #FED7AA` : "none",
    }}>
      {isTeacher ? "T" : name.charAt(0)}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: `3px solid ${ORANGE_MID}`, borderTopColor: ORANGE,
        animation: "spin 0.8s linear infinite", margin: "0 auto",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      background: "#1F2937", color: "#fff", borderRadius: 20,
      padding: "10px 20px", fontSize: 14, zIndex: 999,
      fontFamily: "'Noto Sans KR', sans-serif", whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }}>
      {msg}
    </div>
  );
}

function BottomNav({ screen, setScreen }) {
  const items = [
    { key: "home", icon: "🏠", label: "홈" },
    { key: "notices", icon: "📢", label: "공지" },
    { key: "feed", icon: "🌱", label: "성장기록" },
    { key: "upload", icon: "✏️", label: "기록하기" },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: CARD_BG, borderTop: "1px solid #F3E8D4",
      display: "flex", zIndex: 100,
      boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
    }}>
      {items.map(item => (
        <button key={item.key} onClick={() => setScreen(item.key)} style={{
          flex: 1, padding: "10px 0 8px", background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        }}>
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{
            fontSize: 11, fontWeight: screen === item.key ? "700" : "400",
            color: screen === item.key ? ORANGE : GRAY,
            fontFamily: "'Noto Sans KR', sans-serif",
          }}>{item.label}</span>
          {screen === item.key && <div style={{ width: 4, height: 4, borderRadius: "50%", background: ORANGE }} />}
        </button>
      ))}
    </nav>
  );
}

// ──────────────────────────────────────────────
// Supabase 데이터 훅
// ──────────────────────────────────────────────
function useSupabase() {
  const isConfigured = true;

  // ── 공지 ──
  const fetchNotices = async () => {
    if (!isConfigured) return MOCK_NOTICES;
    const { data } = await supabase.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    return data || [];
  };

  const addNotice = async (notice) => {
    if (!isConfigured) return { ...notice, id: `n${Date.now()}`, created_at: new Date().toISOString() };
    const { data } = await supabase.from("notices").insert([notice]).select().single();
    return data;
  };

  // ── 게시글 ──
  const fetchPosts = async () => {
    if (!isConfigured) return MOCK_POSTS;
    const { data: posts } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    if (!posts) return [];
    const ids = posts.map(p => p.id);
    const [{ data: comments }, { data: likes }] = await Promise.all([
      supabase.from("comments").select("*").in("post_id", ids).order("created_at"),
      supabase.from("likes").select("*").in("post_id", ids),
    ]);
    return posts.map(p => ({
      ...p,
      _comments: (comments || []).filter(c => c.post_id === p.id),
      _likes: (likes || []).filter(l => l.post_id === p.id).length,
      _liked: (likes || []).some(l => l.post_id === p.id && l.session_id === SESSION_ID),
    }));
  };

  const addPost = async (post) => {
    if (!isConfigured) return { ...post, id: `p${Date.now()}`, created_at: new Date().toISOString(), _comments: [], _likes: 0, _liked: false };
    const { data } = await supabase.from("posts").insert([post]).select().single();
    return { ...data, _comments: [], _likes: 0, _liked: false };
  };

  // ── 댓글 ──
  const addComment = async (postId, author, text) => {
    const comment = { post_id: postId, author, text };
    if (!isConfigured) return { ...comment, id: `c${Date.now()}`, created_at: new Date().toISOString() };
    const { data } = await supabase.from("comments").insert([comment]).select().single();
    return data;
  };

  // ── 좋아요 ──
  const toggleLike = async (postId, currentlyLiked) => {
    if (!isConfigured) return !currentlyLiked;
    if (currentlyLiked) {
      await supabase.from("likes").delete().eq("post_id", postId).eq("session_id", SESSION_ID);
    } else {
      await supabase.from("likes").insert([{ post_id: postId, session_id: SESSION_ID }]);
    }
    return !currentlyLiked;
  };

  // ── 사진 업로드 ──
  const uploadPhoto = async (file) => {
    if (!isConfigured) return null;
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type });
    if (error) return null;
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  return { fetchNotices, addNotice, fetchPosts, addPost, addComment, toggleLike, uploadPhoto, isConfigured };
}

// ──────────────────────────────────────────────
// 홈 화면
// ──────────────────────────────────────────────
function HomeScreen({ setScreen, notices, posts }) {
  return (
    <div style={{ padding: "20px 16px 24px" }}>
      <div style={{
        background: "linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)",
        borderRadius: 20, padding: "24px 20px", marginBottom: 20,
        border: "1px solid #FBCFA0",
      }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>📚</div>
        <h1 style={{ fontSize: 22, fontWeight: "800", color: BROWN, margin: "0 0 6px", fontFamily: "'Noto Sans KR', sans-serif" }}>
          책마루 성장기록
        </h1>
        <p style={{ fontSize: 14, color: "#92400E", margin: 0, lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif" }}>
          매일의 작은 기록이 큰 성장이 됩니다 🌱
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { icon: "📢", label: "공지사항", sub: "선생님 소식", key: "notices", bg: "#FEF3C7", bd: "#FDE68A" },
          { icon: "🌱", label: "성장기록", sub: "친구들 피드", key: "feed", bg: "#F0FDF4", bd: "#BBF7D0" },
          { icon: "✏️", label: "기록하기", sub: "오늘 기록 남기기", key: "upload", bg: "#EFF6FF", bd: "#BFDBFE" },
          { icon: "🔐", label: "선생님 전용", sub: "공지 작성", key: "teacherLogin", bg: "#FDF4FF", bd: "#E9D5FF" },
        ].map(item => (
          <button key={item.label} onClick={() => setScreen(item.key)} style={{
            background: item.bg, border: `1px solid ${item.bd}`,
            borderRadius: 16, padding: "16px 14px", cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontSize: 14, fontWeight: "700", color: "#1F2937", fontFamily: "'Noto Sans KR', sans-serif" }}>{item.label}</div>
            <div style={{ fontSize: 12, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>{item.sub}</div>
          </button>
        ))}
      </div>

      {/* 최근 공지 */}
      <SectionHeader title="📣 최근 공지" onMore={() => setScreen("notices")} />
      {notices.slice(0, 2).map(n => (
        <div key={n.id} style={{ background: CARD_BG, border: "1px solid #F3E8D4", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: "600", color: "#1F2937", fontFamily: "'Noto Sans KR', sans-serif" }}>{n.title}</div>
            <div style={{ fontSize: 12, color: GRAY, marginTop: 2, fontFamily: "'Noto Sans KR', sans-serif" }}>{fmtDate(n.created_at)}</div>
          </div>
          {n.pinned && <PillBadge text="필독" />}
        </div>
      ))}

      {/* 최근 기록 */}
      <div style={{ marginTop: 16 }}>
        <SectionHeader title="🌟 최근 기록" onMore={() => setScreen("feed")} />
        {posts.slice(0, 2).map(post => (
          <MiniPostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, onMore }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: "700", color: "#1F2937", margin: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>{title}</h2>
      <button onClick={onMore} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: ORANGE, fontFamily: "'Noto Sans KR', sans-serif" }}>전체보기 →</button>
    </div>
  );
}

function PillBadge({ text, bg = ORANGE, color = "#fff" }) {
  return <span style={{ fontSize: 11, background: bg, color, padding: "3px 10px", borderRadius: 20, fontFamily: "'Noto Sans KR', sans-serif", whiteSpace: "nowrap" }}>{text}</span>;
}

function MiniPostCard({ post }) {
  const meta = TYPE_META[post.type] || {};
  return (
    <div style={{ background: CARD_BG, border: "1px solid #F3E8D4", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Avatar name={post.author} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: "700", color: "#1F2937", fontFamily: "'Noto Sans KR', sans-serif" }}>{post.author}</span>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, background: meta.bg, color: meta.text, border: `1px solid ${meta.border}`, fontFamily: "'Noto Sans KR', sans-serif" }}>{post.type}</span>
          </div>
          <p style={{ fontSize: 13, color: "#374151", margin: "3px 0 0", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontFamily: "'Noto Sans KR', sans-serif" }}>{post.content}</p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 공지사항 목록
// ──────────────────────────────────────────────
function NoticesScreen({ setScreen, notices, setDetailNotice }) {
  return (
    <div style={{ padding: "20px 16px 24px" }}>
      <h1 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: "0 0 16px", fontFamily: "'Noto Sans KR', sans-serif" }}>📢 공지사항</h1>
      {notices.length === 0 && <p style={{ color: GRAY, textAlign: "center", padding: "40px 0", fontFamily: "'Noto Sans KR', sans-serif" }}>공지사항이 없어요</p>}
      {notices.map(n => (
        <button key={n.id} onClick={() => { setDetailNotice(n); setScreen("noticeDetail"); }}
          style={{ width: "100%", background: n.pinned ? ORANGE_LIGHT : CARD_BG, border: `1px solid ${n.pinned ? ORANGE_MID : "#F3E8D4"}`, borderRadius: 16, padding: "16px", marginBottom: 10, cursor: "pointer", textAlign: "left" }}>
          {n.pinned && <div style={{ marginBottom: 6 }}><PillBadge text="📌 필독" /></div>}
          <div style={{ fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 6, fontFamily: "'Noto Sans KR', sans-serif" }}>{n.title}</div>
          <p style={{ fontSize: 13, color: GRAY, margin: "0 0 8px", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontFamily: "'Noto Sans KR', sans-serif" }}>{n.content}</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>📅 {fmtDate(n.created_at)}</span>
            <span style={{ fontSize: 12, color: ORANGE, fontFamily: "'Noto Sans KR', sans-serif" }}>자세히 →</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// 공지 상세
// ──────────────────────────────────────────────
function NoticeDetailScreen({ notice, setScreen }) {
  if (!notice) return null;
  return (
    <div style={{ padding: "20px 16px 24px" }}>
      <button onClick={() => setScreen("notices")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: ORANGE, marginBottom: 16, padding: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>← 목록으로</button>
      <div style={{ background: CARD_BG, border: "1px solid #F3E8D4", borderRadius: 20, padding: "20px" }}>
        {notice.pinned && <div style={{ marginBottom: 12 }}><PillBadge text="📌 필독 공지" /></div>}
        <h2 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: "0 0 12px", lineHeight: 1.4, fontFamily: "'Noto Sans KR', sans-serif" }}>{notice.title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #F3E8D4" }}>
          <Avatar name="책마루 선생님" size={28} />
          <span style={{ fontSize: 13, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>책마루 선생님 · {fmtDate(notice.created_at)}</span>
        </div>
        <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.9, margin: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>{notice.content}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 성장기록 피드
// ──────────────────────────────────────────────
function FeedScreen({ setScreen, db }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [expanded, setExpanded] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentAuthor, setCommentAuthor] = useState({});
  const [submittingComment, setSubmittingComment] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    db.fetchPosts().then(data => { setPosts(data); setLoading(false); });
  }, []);

  const filtered = filter === "전체" ? posts : posts.filter(p => p.type === filter);

  const handleLike = async (postId) => {
    const post = posts.find(p => p.id === postId);
    const newLiked = await db.toggleLike(postId, post._liked);
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, _liked: newLiked, _likes: p._likes + (newLiked ? 1 : -1) }
      : p
    ));
  };

  const handleComment = async (postId) => {
    const text = commentText[postId]?.trim();
    const author = commentAuthor[postId]?.trim() || "익명";
    if (!text) return;
    setSubmittingComment(prev => ({ ...prev, [postId]: true }));
    const newComment = await db.addComment(postId, author, text);
    if (newComment) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, _comments: [...p._comments, newComment] } : p));
      setCommentText(prev => ({ ...prev, [postId]: "" }));
      setToast("댓글이 등록됐어요 💬");
    }
    setSubmittingComment(prev => ({ ...prev, [postId]: false }));
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: "20px 16px 24px" }}>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>🌱 성장기록</h1>
        <button onClick={() => setScreen("upload")} style={{ background: ORANGE, color: "#fff", border: "none", borderRadius: 20, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: "700", fontFamily: "'Noto Sans KR', sans-serif" }}>+ 기록하기</button>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {["전체", "독서", "운동", "일과", "습관"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer",
            background: filter === f ? ORANGE : "#F3E8D4",
            color: filter === f ? "#fff" : BROWN,
            fontSize: 13, fontWeight: filter === f ? "700" : "400",
            whiteSpace: "nowrap", flexShrink: 0, fontFamily: "'Noto Sans KR', sans-serif",
          }}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 && <p style={{ color: GRAY, textAlign: "center", padding: "40px 0", fontFamily: "'Noto Sans KR', sans-serif" }}>아직 기록이 없어요. 첫 번째로 올려봐요! 🌱</p>}

      {filtered.map(post => {
        const meta = TYPE_META[post.type] || {};
        const isExpanded = expanded[post.id];
        return (
          <div key={post.id} style={{ background: CARD_BG, border: "1px solid #F3E8D4", borderRadius: 20, padding: "16px", marginBottom: 14 }}>
            {/* 헤더 */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
              <Avatar name={post.author} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: "700", color: "#1F2937", fontFamily: "'Noto Sans KR', sans-serif" }}>{post.author}</span>
                  {post.grade && <span style={{ fontSize: 12, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>{post.grade}</span>}
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: meta.bg, color: meta.text, border: `1px solid ${meta.border}`, fontFamily: "'Noto Sans KR', sans-serif" }}>{post.type}</span>
                </div>
                <div style={{ fontSize: 12, color: GRAY, marginTop: 2, fontFamily: "'Noto Sans KR', sans-serif" }}>{fmtDate(post.created_at)}</div>
              </div>
            </div>

            {/* 사진 */}
            {post.image_url && (
              <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 10, background: "#F3F4F6" }}>
                <img src={post.image_url} alt="기록 사진" style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
              </div>
            )}

            {/* 이모지 (사진 없을 때) */}
            {!post.image_url && (
              <div style={{ background: IVORY, borderRadius: 12, padding: "10px", marginBottom: 10, textAlign: "center", fontSize: 44 }}>
                {post.emoji || meta.emoji}
              </div>
            )}

            {/* 내용 */}
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.75, margin: "0 0 12px", fontFamily: "'Noto Sans KR', sans-serif" }}>{post.content}</p>

            {/* 액션 */}
            <div style={{ display: "flex", gap: 14, borderTop: "1px solid #F3E8D4", paddingTop: 10, marginBottom: isExpanded ? 12 : 0 }}>
              <button onClick={() => handleLike(post.id)} style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 13, color: post._liked ? ORANGE : GRAY,
                fontFamily: "'Noto Sans KR', sans-serif",
                transition: "transform 0.15s",
              }}>
                <span style={{ fontSize: 16 }}>{post._liked ? "❤️" : "🤍"}</span> {post._likes}
              </button>
              <button onClick={() => setExpanded(prev => ({ ...prev, [post.id]: !prev[post.id] }))} style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 13, color: isExpanded ? ORANGE : GRAY,
                fontFamily: "'Noto Sans KR', sans-serif",
              }}>
                <span style={{ fontSize: 16 }}>💬</span> {post._comments.length}개
              </button>
            </div>

            {/* 댓글 영역 */}
            {isExpanded && (
              <div>
                {post._comments.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <Avatar name={c.author} size={26} />
                    <div style={{ background: "#F9F5F0", borderRadius: 10, padding: "7px 11px", flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: "700", color: "#1F2937", fontFamily: "'Noto Sans KR', sans-serif" }}>{c.author} </span>
                      <span style={{ fontSize: 13, color: "#374151", fontFamily: "'Noto Sans KR', sans-serif" }}>{c.text}</span>
                    </div>
                  </div>
                ))}

                {/* 댓글 작성 */}
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    value={commentAuthor[post.id] || ""}
                    onChange={e => setCommentAuthor(prev => ({ ...prev, [post.id]: e.target.value }))}
                    placeholder="이름 (선택)"
                    style={{ border: "1px solid #F3E8D4", borderRadius: 10, padding: "7px 12px", fontSize: 13, outline: "none", background: "#FAFAF8", fontFamily: "'Noto Sans KR', sans-serif" }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={commentText[post.id] || ""}
                      onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleComment(post.id)}
                      placeholder="응원 댓글을 남겨요 💬"
                      style={{ flex: 1, border: "1px solid #F3E8D4", borderRadius: 20, padding: "8px 14px", fontSize: 13, outline: "none", background: "#FAFAF8", fontFamily: "'Noto Sans KR', sans-serif" }}
                    />
                    <button onClick={() => handleComment(post.id)} disabled={submittingComment[post.id]} style={{
                      background: ORANGE, color: "#fff", border: "none", borderRadius: 20,
                      padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: "700",
                      fontFamily: "'Noto Sans KR', sans-serif",
                      opacity: submittingComment[post.id] ? 0.6 : 1,
                    }}>등록</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────
// 기록 업로드 (사진 포함)
// ──────────────────────────────────────────────
function UploadScreen({ setScreen, db, onPostAdded }) {
  const [form, setForm] = useState({ author: "", grade: "", type: "독서", content: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef();

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.author.trim() || !form.content.trim()) return;
    setUploading(true);
    let imageUrl = null;
    if (imageFile) imageUrl = await db.uploadPhoto(imageFile);
    const newPost = await db.addPost({
      author: form.author,
      grade: form.grade || null,
      type: form.type,
      content: form.content,
      image_url: imageUrl,
      emoji: TYPE_META[form.type]?.emoji || "📝",
    });
    if (newPost) onPostAdded(newPost);
    setUploading(false);
    setDone(true);
    setTimeout(() => { setDone(false); setScreen("feed"); }, 1600);
  };

  if (done) {
    return (
      <div style={{ padding: "80px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 20, fontWeight: "800", color: BROWN, fontFamily: "'Noto Sans KR', sans-serif" }}>기록 완료!</h2>
        <p style={{ fontSize: 14, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>피드로 이동합니다...</p>
      </div>
    );
  }

  const valid = form.author.trim() && form.content.trim();

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <h1 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: "0 0 4px", fontFamily: "'Noto Sans KR', sans-serif" }}>✏️ 오늘의 기록</h1>
      <p style={{ fontSize: 13, color: GRAY, margin: "0 0 20px", fontFamily: "'Noto Sans KR', sans-serif" }}>오늘 하루를 기록해봐요 🌱</p>

      {/* 이름 */}
      <Field label="이름 *">
        <input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} placeholder="이름을 입력해주세요" style={inputStyle} />
      </Field>

      {/* 학년 */}
      <Field label="학년">
        <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
          <option value="">선택 안함</option>
          {["초4","초5","초6","중1","중2","중3","고1","고2","고3"].map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>

      {/* 기록 종류 */}
      <Field label="기록 종류 *">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {Object.entries(TYPE_META).map(([type, meta]) => (
            <button key={type} onClick={() => setForm(p => ({ ...p, type }))} style={{
              background: form.type === type ? meta.bg : CARD_BG,
              border: `2px solid ${form.type === type ? meta.text : "#F3E8D4"}`,
              borderRadius: 12, padding: "11px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 20 }}>{meta.emoji}</span>
              <span style={{ fontSize: 14, fontWeight: form.type === type ? "700" : "400", color: form.type === type ? meta.text : "#374151", fontFamily: "'Noto Sans KR', sans-serif" }}>{type}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* 사진 업로드 */}
      <Field label="📷 사진 첨부 (선택)">
        <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
        {imagePreview ? (
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
            <img src={imagePreview} alt="미리보기" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
            <button onClick={() => { setImageFile(null); setImagePreview(null); fileRef.current.value = ""; }}
              style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current.click()} style={{
            width: "100%", border: `2px dashed ${ORANGE_MID}`, borderRadius: 12,
            padding: "28px 0", background: ORANGE_LIGHT, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 32 }}>📷</span>
            <span style={{ fontSize: 13, color: "#92400E", fontFamily: "'Noto Sans KR', sans-serif" }}>탭하여 사진 추가</span>
            <span style={{ fontSize: 11, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>운동, 독서, 일상 사진을 올려봐요</span>
          </button>
        )}
      </Field>

      {/* 내용 */}
      <Field label="오늘의 기록 *">
        <textarea
          value={form.content}
          onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
          placeholder="오늘 무엇을 했나요? 느낀 점도 함께 적어봐요 😊"
          rows={5}
          style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }}
        />
      </Field>

      {!db.isConfigured && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400E", lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif" }}>
          ⚠️ 현재 데모 모드입니다. 실제 저장을 위해 코드 상단의 SUPABASE_URL과 SUPABASE_ANON_KEY를 설정해주세요.
        </div>
      )}

      <button onClick={handleSubmit} disabled={!valid || uploading} style={{
        width: "100%", background: (!valid || uploading) ? "#F3E8D4" : ORANGE,
        color: (!valid || uploading) ? GRAY : "#fff",
        border: "none", borderRadius: 14, padding: "15px",
        fontSize: 16, fontWeight: "800", cursor: valid && !uploading ? "pointer" : "default",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}>
        {uploading ? "⏳ 업로드 중..." : "🌱 기록 올리기"}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", display: "block", marginBottom: 6, fontFamily: "'Noto Sans KR', sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", border: "1px solid #F3E8D4", borderRadius: 12,
  padding: "11px 14px", fontSize: 14, outline: "none",
  background: CARD_BG, boxSizing: "border-box",
  fontFamily: "'Noto Sans KR', sans-serif",
};

// ──────────────────────────────────────────────
// 선생님 로그인
// ──────────────────────────────────────────────
function TeacherLoginScreen({ setScreen, onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const handleLogin = () => {
    if (pw === TEACHER_PASSWORD) {
      onLogin();
      setScreen("teacherWrite");
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div style={{ padding: "40px 16px 24px" }}>
      <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: ORANGE, marginBottom: 24, padding: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>← 홈으로</button>

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🔐</div>
        <h2 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: "0 0 6px", fontFamily: "'Noto Sans KR', sans-serif" }}>선생님 전용 공간</h2>
        <p style={{ fontSize: 14, color: GRAY, margin: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>비밀번호를 입력해주세요</p>
      </div>

      <div style={{
        background: CARD_BG, border: "1px solid #F3E8D4", borderRadius: 20, padding: "24px",
        animation: shaking ? "shake 0.4s ease" : "none",
      }}>
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }`}</style>

        <label style={{ fontSize: 13, fontWeight: "600", color: "#374151", display: "block", marginBottom: 8, fontFamily: "'Noto Sans KR', sans-serif" }}>비밀번호</label>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError(false); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          placeholder="비밀번호 입력"
          style={{
            ...inputStyle,
            border: `1px solid ${error ? "#FCA5A5" : "#F3E8D4"}`,
            background: error ? "#FFF5F5" : CARD_BG,
          }}
        />
        {error && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 6, margin: "6px 0 0", fontFamily: "'Noto Sans KR', sans-serif" }}>❌ 비밀번호가 틀렸어요</p>}

        <button onClick={handleLogin} style={{
          width: "100%", marginTop: 16, background: ORANGE, color: "#fff",
          border: "none", borderRadius: 12, padding: "13px",
          fontSize: 15, fontWeight: "700", cursor: "pointer",
          fontFamily: "'Noto Sans KR', sans-serif",
        }}>입장하기</button>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: GRAY, marginTop: 16, fontFamily: "'Noto Sans KR', sans-serif" }}>
        기본 비밀번호: bookmaru2025<br />코드 상단 TEACHER_PASSWORD 에서 변경 가능
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────
// 선생님 공지 작성
// ──────────────────────────────────────────────
function TeacherWriteScreen({ setScreen, db, onNoticeAdded, onLogout }) {
  const [form, setForm] = useState({ title: "", content: "", pinned: false });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const notice = await db.addNotice({ title: form.title, content: form.content, pinned: form.pinned });
    if (notice) {
      onNoticeAdded(notice);
      setDone(true);
      setTimeout(() => { setDone(false); setScreen("notices"); }, 1600);
    } else {
      setToast("저장에 실패했어요. 다시 시도해주세요.");
    }
    setSaving(false);
  };

  if (done) {
    return (
      <div style={{ padding: "80px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📢</div>
        <h2 style={{ fontSize: 20, fontWeight: "800", color: BROWN, fontFamily: "'Noto Sans KR', sans-serif" }}>공지 등록 완료!</h2>
        <p style={{ fontSize: 14, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>공지사항 목록으로 이동합니다...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: "800", color: BROWN, margin: 0, fontFamily: "'Noto Sans KR', sans-serif" }}>📢 공지 작성</h1>
        <button onClick={() => { onLogout(); setScreen("home"); }} style={{ background: "none", border: "1px solid #F3E8D4", borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: GRAY, fontFamily: "'Noto Sans KR', sans-serif" }}>로그아웃</button>
      </div>
      <p style={{ fontSize: 13, color: GRAY, margin: "0 0 20px", fontFamily: "'Noto Sans KR', sans-serif" }}>선생님 전용 공간입니다 🔐</p>

      {/* 필독 토글 */}
      <div style={{ background: ORANGE_LIGHT, border: `1px solid ${ORANGE_MID}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: "700", color: BROWN, fontFamily: "'Noto Sans KR', sans-serif" }}>📌 필독 공지로 등록</div>
          <div style={{ fontSize: 12, color: "#92400E", fontFamily: "'Noto Sans KR', sans-serif" }}>활성화 시 상단에 강조 표시됩니다</div>
        </div>
        <div
          onClick={() => setForm(p => ({ ...p, pinned: !p.pinned }))}
          style={{
            width: 44, height: 24, borderRadius: 12, cursor: "pointer",
            background: form.pinned ? ORANGE : "#D1D5DB",
            position: "relative", transition: "background 0.2s",
          }}
        >
          <div style={{
            position: "absolute", top: 2, left: form.pinned ? 22 : 2,
            width: 20, height: 20, borderRadius: "50%", background: "#fff",
            transition: "left 0.2s",
          }} />
        </div>
      </div>

      {/* 제목 */}
      <Field label="제목 *">
        <input
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          placeholder="공지 제목을 입력해주세요"
          style={inputStyle}
        />
      </Field>

      {/* 내용 */}
      <Field label="내용 *">
        <textarea
          value={form.content}
          onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
          placeholder="학생들에게 전달할 내용을 적어주세요 😊"
          rows={8}
          style={{ ...inputStyle, resize: "none", lineHeight: 1.7 }}
        />
      </Field>

      {/* 미리보기 */}
      {(form.title || form.content) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: "600", color: GRAY, marginBottom: 8, fontFamily: "'Noto Sans KR', sans-serif" }}>미리보기</div>
          <div style={{ background: form.pinned ? ORANGE_LIGHT : CARD_BG, border: `1px solid ${form.pinned ? ORANGE_MID : "#F3E8D4"}`, borderRadius: 14, padding: "14px" }}>
            {form.pinned && <div style={{ marginBottom: 8 }}><PillBadge text="📌 필독" /></div>}
            <div style={{ fontSize: 15, fontWeight: "700", color: "#1F2937", marginBottom: 6, fontFamily: "'Noto Sans KR', sans-serif" }}>{form.title || "(제목)"}</div>
            <p style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif" }}>{form.content || "(내용)"}</p>
          </div>
        </div>
      )}

      {!db.isConfigured && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400E", lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif" }}>
          ⚠️ 데모 모드 — 저장되지 않습니다. Supabase 연결 후 사용 가능합니다.
        </div>
      )}

      <button onClick={handleSave} disabled={!form.title.trim() || !form.content.trim() || saving} style={{
        width: "100%",
        background: (!form.title.trim() || !form.content.trim() || saving) ? "#F3E8D4" : ORANGE,
        color: (!form.title.trim() || !form.content.trim() || saving) ? GRAY : "#fff",
        border: "none", borderRadius: 14, padding: "15px",
        fontSize: 16, fontWeight: "800", cursor: "pointer",
        fontFamily: "'Noto Sans KR', sans-serif",
      }}>
        {saving ? "⏳ 저장 중..." : "📢 공지 등록하기"}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────
// 최상위 App
// ──────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [notices, setNotices] = useState([]);
  const [posts, setPosts] = useState([]);
  const [detailNotice, setDetailNotice] = useState(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);
  const db = useSupabase();

  // 초기 데이터 로드
  useEffect(() => {
    Promise.all([db.fetchNotices(), db.fetchPosts()])
      .then(([n, p]) => { setNotices(n); setPosts(p); })
      .finally(() => setLoadingInit(false));
  }, []);

  if (loadingInit) {
    return (
      <div style={{ maxWidth: 430, margin: "0 auto", background: IVORY, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <Spinner />
          <p style={{ fontSize: 13, color: GRAY, marginTop: 12, fontFamily: "'Noto Sans KR', sans-serif" }}>책마루 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", background: IVORY, minHeight: "100vh", fontFamily: "'Noto Sans KR', sans-serif", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ paddingBottom: 72 }}>
        {screen === "home" && <HomeScreen setScreen={setScreen} notices={notices} posts={posts} />}
        {screen === "notices" && <NoticesScreen setScreen={setScreen} notices={notices} setDetailNotice={setDetailNotice} />}
        {screen === "noticeDetail" && <NoticeDetailScreen notice={detailNotice} setScreen={setScreen} />}
        {screen === "feed" && <FeedScreen setScreen={setScreen} db={db} />}
        {screen === "upload" && (
          <UploadScreen
            setScreen={setScreen} db={db}
            onPostAdded={post => setPosts(prev => [post, ...prev])}
          />
        )}
        {screen === "teacherLogin" && (
          <TeacherLoginScreen setScreen={setScreen} onLogin={() => setIsTeacher(true)} />
        )}
        {screen === "teacherWrite" && isTeacher && (
          <TeacherWriteScreen
            setScreen={setScreen} db={db}
            onNoticeAdded={n => setNotices(prev => [n, ...prev].sort((a, b) => b.pinned - a.pinned))}
            onLogout={() => setIsTeacher(false)}
          />
        )}
        {screen === "teacherWrite" && !isTeacher && <TeacherLoginScreen setScreen={setScreen} onLogin={() => setIsTeacher(true)} />}
      </div>
      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  );
}

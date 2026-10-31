export type Surface = "writer" | "good-ai" | "knowledge" | "templates";
export const surfaces: {
  id: Surface;
  name: string;
  detail: string;
  path: string;
}[] = [
  {
    id: "writer",
    name: "写作工作台",
    detail: "编辑正文、核对修订与导出",
    path: "M5 4h10l4 4v12H5z M9 12h6 M9 16h6",
  },
  {
    id: "good-ai",
    name: "Good AI",
    detail: "围绕当前文稿生成、修改与审阅",
    path: "M4 4h16v12H9l-5 4z M8 8h8 M8 12h5",
  },
  {
    id: "knowledge",
    name: "知识库",
    detail: "整理资料、检索片段与查看原文",
    path: "M3 5h7l2 2h9v13H3z M7 12h10 M7 16h7",
  },
  {
    id: "templates",
    name: "模板库",
    detail: "预览写作结构与基础版式",
    path: "M4 3h16v18H4z M4 9h16 M10 9v12",
  },
];

export default function AppNavigation({
  view,
  expanded,
  onToggle,
  onNavigate,
  onStart,
  user,
  onLogout,
}: {
  view: Surface;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (v: Surface) => void;
  onStart: () => void;
  user: string;
  onLogout: () => void;
}) {
  return (
    <aside
      className={`app-navigation ${expanded ? "expanded" : "collapsed"}`}
      aria-label="应用导航"
    >
      <a
        className="product-brand"
        href="#writer"
        onClick={() => onNavigate("writer")}
        title="文渊写作工作台"
      >
        <span className="brand-mark">文</span>
        <span className="nav-label">
          <b>文渊</b>
          <small>中文文章与公文写作</small>
        </span>
      </a>
      <button
        className="primary start-writing"
        onClick={onStart}
        title="开始写作"
        aria-label="开始写作"
      >
        <span aria-hidden="true">＋</span>
        <span className="nav-label">开始写作</span>
      </button>
      <div className="nav-section nav-label">工作空间</div>
      <nav aria-label="主导航">
        {surfaces.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            title={s.name}
            aria-label={s.name}
            aria-current={view === s.id ? "page" : undefined}
            onClick={() => onNavigate(s.id)}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d={s.path} />
            </svg>
            <span className="nav-label">{s.name}</span>
          </a>
        ))}
      </nav>
      <footer>
        <span className="account-initial" aria-hidden="true">
          {user.slice(0, 1).toUpperCase()}
        </span>
        <span className="nav-label account-name" title={user}>
          {user}
          <small>本地工作区</small>
        </span>
        <button onClick={onLogout} title="退出登录" aria-label="退出登录">
          退出
        </button>
      </footer>
      <button
        className="nav-collapse"
        onClick={onToggle}
        aria-label={expanded ? "收起主导航" : "展开主导航"}
        title={expanded ? "收起主导航" : "展开主导航"}
      >
        {expanded ? "‹" : "›"}
        <span className="nav-label">收起导航</span>
      </button>
    </aside>
  );
}

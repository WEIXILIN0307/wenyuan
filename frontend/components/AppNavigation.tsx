import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  LogOut,
  MessageSquare,
  PenLine,
  Settings,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export type Surface = "writer" | "good-ai" | "knowledge" | "templates";
export const surfaces: {
  id: Surface;
  name: string;
  detail: string;
  section: string;
  icon: LucideIcon;
}[] = [
  {
    id: "writer",
    name: "写作工作台",
    detail: "与 Good AI 协同成稿",
    section: "工作台",
    icon: PenLine,
  },
  {
    id: "good-ai",
    name: "Good AI",
    detail: "围绕当前文稿起草、修改与核对",
    section: "工作台",
    icon: MessageSquare,
  },
  {
    id: "knowledge",
    name: "知识库",
    detail: "管理写作资料与检索依据",
    section: "知识与记忆",
    icon: BookOpen,
  },
  {
    id: "templates",
    name: "模板库",
    detail: "管理写作结构与基础版式",
    section: "能力资产",
    icon: LayoutTemplate,
  },
];

export default function AppNavigation({
  view,
  expanded,
  onToggle,
  onNavigate,
  onStart,
  onSettings,
  user,
  onLogout,
}: {
  view: Surface;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (v: Surface) => void;
  onStart: () => void;
  onSettings: () => void;
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
          <small>中文文稿生产平台</small>
        </span>
      </a>
      <div className="start-writing-wrap">
        <button
          className="primary start-writing"
          onClick={onStart}
          title="开始写作"
          aria-label="开始写作"
        >
          <PenLine size={17} strokeWidth={2.2} />
          <span className="nav-label">开始写作</span>
        </button>
      </div>
      <nav aria-label="主导航">
        {["工作台", "知识与记忆", "能力资产"].map((section) => (
          <div className="navigation-group" key={section}>
            <div className="nav-section nav-label">{section}</div>
            {surfaces
              .filter((s) => s.section === section)
              .map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  title={s.name}
                  aria-label={s.name}
                  aria-current={view === s.id ? "page" : undefined}
                  onClick={() => onNavigate(s.id)}
                >
                  {view === s.id && <span className="navigation-active-rule" />}
                  <s.icon size={17} strokeWidth={1.9} />
                  <span className="nav-label">{s.name}</span>
                </a>
              ))}
          </div>
        ))}
        <div className="navigation-group">
          <div className="nav-section nav-label">系统</div>
          <button
            className="navigation-service"
            onClick={onSettings}
            aria-label="模型设置"
            title="服务配置"
          >
            <Settings2 size={17} strokeWidth={1.9} />
            <span className="nav-label">服务配置</span>
          </button>
        </div>
      </nav>
      <div className="navigation-bottom">
        <button
          className="navigation-settings"
          onClick={onSettings}
          title="系统设置"
        >
          <Settings size={17} strokeWidth={1.9} />
          <span className="nav-label">系统设置</span>
        </button>
        <footer>
          <span className="account-initial" aria-hidden="true">
            {user.slice(0, 1).toUpperCase()}
          </span>
          <div className="nav-label account-name" title={user}>
            <span>{user}</span>
            <button onClick={onLogout} aria-label="退出登录">
              <LogOut size={12} /> 安全退出
            </button>
          </div>
          {!expanded && (
            <button
              className="compact-logout"
              onClick={onLogout}
              aria-label="退出登录"
              title="退出登录"
            >
              <LogOut size={14} />
            </button>
          )}
        </footer>
        <button
          className="nav-collapse"
          onClick={onToggle}
          aria-label={expanded ? "收起主导航" : "展开主导航"}
          title={expanded ? "收起主导航" : "展开主导航"}
        >
          {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          <span className="nav-label">收起导航</span>
        </button>
      </div>
    </aside>
  );
}

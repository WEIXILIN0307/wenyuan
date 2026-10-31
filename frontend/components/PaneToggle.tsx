type Props = {
  side: "left" | "right";
  expanded: boolean;
  onClick: () => void;
};

export default function PaneToggle({ side, expanded, onClick }: Props) {
  const label = `${expanded ? "收起" : "展开"}${side === "left" ? "文稿栏" : "辅助面板"}`;
  return (
    <button
      className="pane-toggle"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={side === "left" ? "manuscript-pane" : "assistant-pane"}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d={side === "left" ? "M9 4v16" : "M15 4v16"}
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {expanded && (
          <path
            d={side === "left" ? "M5 7h2v10H5z" : "M17 7h2v10h-2z"}
            fill="currentColor"
            opacity=".3"
          />
        )}
      </svg>
    </button>
  );
}

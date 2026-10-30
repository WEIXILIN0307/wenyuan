"""Original small writing presets. No imported templates, fonts, or assets."""

PRESETS = {
    "notice": {
        "name": "通知",
        "title": "关于开展社区阅读活动的通知",
        "font": "serif",
        "font_size": 20,
        "margin": 90,
        "line_height": 1.8,
        "sections": ["活动安排", "参与方式", "联系与反馈"],
        "guidance": "说明通知对象、经核实的活动安排和参与方式。未提供的日期、地点、联系人不得编造。",
    },
    "summary": {
        "name": "工作总结",
        "title": "阶段工作总结",
        "font": "serif",
        "font_size": 16,
        "margin": 76,
        "line_height": 1.7,
        "sections": ["工作回顾", "不足与改进", "下一步安排"],
        "guidance": "区分已经完成的工作、存在问题和后续安排；成绩与数字必须有依据。",
    },
    "brief": {
        "name": "简报",
        "title": "工作进展简报",
        "font": "sans-serif",
        "font_size": 16,
        "margin": 70,
        "line_height": 1.65,
        "sections": ["本期要点", "进展记录", "后续关注"],
        "guidance": "围绕本期事实简明记录，不虚构期号、机构或成效。",
    },
    "article": {
        "name": "通用文章",
        "title": "文章标题",
        "font": "serif",
        "font_size": 16,
        "margin": 76,
        "line_height": 1.7,
        "sections": ["问题与背景", "论述与材料", "结语"],
        "guidance": "明确主题，区分材料事实与作者观点，以资料支持论述。",
    },
}

import "./style.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "文渊 · AI 写作工作台",
  description: "可回读、可确认的中文文档写作",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

import "./style.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "文渊 · 文章与公文写作",
  description: "资料整理、文稿编辑与修订确认",
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

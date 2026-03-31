import React from "react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "chemd",
  description: "Chemical markdown compiler playground scaffold"
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="zh-CN">
    <body>{children}</body>
  </html>
);

export default RootLayout;

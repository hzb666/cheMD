import React from "react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import "ketcher-react/dist/index.css";

import "./globals.css";
import "../features/playground/styles/playground.css";
import { ThemeProvider } from "../components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "chemd",
  description: "Chemical markdown compiler playground scaffold"
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="zh-CN" suppressHydrationWarning className={`${inter.variable}`}>
    <body className="font-sans antialiased">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </body>
  </html>
);

export default RootLayout;

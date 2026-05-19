import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { DocsLogo } from '@/components/docs-logo';
import { i18n } from './i18n';
import { gitConfig } from './shared';

export const i18nUI = defineI18nUI(i18n, {
  zh: {
    displayName: '中文',
    search: '搜索文档',
    searchNoResult: '未找到结果',
    toc: '本页目录',
    tocNoHeadings: '无标题',
    lastUpdate: '最后更新于',
    chooseLanguage: '选择语言',
    nextPage: '下一页',
    previousPage: '上一页',
    chooseTheme: '选择主题',
    editOnGithub: '在 GitHub 编辑',
  },
  en: {
    displayName: 'English',
  },
});

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: <DocsLogo />,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}

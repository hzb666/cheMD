import { i18n } from '@/lib/i18n';
import { i18nUI } from '@/lib/layout.shared';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { notFound } from 'next/navigation';

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang as (typeof i18n.languages)[number])) {
    notFound();
  }

  return <RootProvider i18n={i18nUI.provider(lang)}>{children}</RootProvider>;
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

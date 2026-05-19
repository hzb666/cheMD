import { redirect } from 'next/navigation';

export default async function LegacyDocsRedirect({
  params,
}: PageProps<'/docs/[[...slug]]'>) {
  const { slug = [] } = await params;
  redirect(`/zh/docs/${slug.join('/')}`);
}

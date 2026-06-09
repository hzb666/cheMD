import { redirect } from 'next/navigation';

export default async function DocsLocaleRedirect({
  params,
}: PageProps<'/docs/[[...slug]]'>) {
  const { slug = [] } = await params;
  redirect(`/zh/docs/${slug.join('/')}`);
}

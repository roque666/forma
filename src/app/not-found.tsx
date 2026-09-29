import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-md px-6 text-center">
      <p className="text-6xl font-extrabold text-accent-text">404</p>
      <h1 className="mt-2 text-xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted">O conteúdo não existe ou não tens permissão para o ver.</p>
      <Link href="/dashboard" className="mt-5 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-accent-fg">Ir para o início</Link>
    </main>
  );
}

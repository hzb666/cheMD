export function DocsLogo() {
  return (
    <span className="inline-flex items-center">
      <img
        src="/chemd-logo-light.svg"
        alt="Chemd"
        width={100}
        height={28}
        className="block h-7 w-auto dark:hidden"
      />
      <img
        src="/chemd-logo-dark.svg"
        alt="Chemd"
        width={100}
        height={28}
        className="hidden h-7 w-auto dark:block"
      />
    </span>
  );
}

const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3z',
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  accounts:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  workspaces: 'M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3',
  plans: 'M12 3 3 7.5 12 12l9-4.5L12 3z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  subscriptions: 'M3 6h18v14H3z M3 10h18 M7 15h3 M16 3v3 M8 3v3',
  access: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4z M8 12l3 3 5-5',
  audit: 'M8 3h11v18H5V6 M8 3v4H4 M9 11h6 M9 15h6',
  academy: 'm2 8 10-5 10 5-10 5L2 8z M6 10v7c4 3 8 3 12 0v-7 M22 8v8',
  feedback: 'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-4 9 9 0 0 1 18-1z M7 11h10 M7 15h5',
  security: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  arrow: 'M19 12H5 M11 6l-6 6 6 6',
  refresh: 'M20 8a9 9 0 0 0-15-3L2 8 M2 2v6h6 M4 16a9 9 0 0 0 15 3l3-3 M16 16h6v6',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close: 'm6 6 12 12 M6 18 18 6',
  more: 'M4 12h1 M11.5 12h1 M19 12h1',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  logout: 'M9 4H3v16h6 M9 12h13 M17 7l5 5-5 5',
  cloud: 'M6 18h12a4 4 0 0 0 .5-8A7 7 0 0 0 5 8a5 5 0 0 0 1 10 M12 10v4 M12 17h.01',
};

export function OperatorIcon({ name, size = 22 }: { name: string; size?: number }) {
  const aliases: Record<string, string> = {
    team: 'accounts',
    password: 'security',
    academy_plans: 'plans',
    academy_subscriptions: 'subscriptions',
    academy_orders: 'audit',
    academy_samples: 'academy',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[aliases[name] ?? name] ?? paths.overview} />
    </svg>
  );
}

export type AcademyIconName =
  'star' | 'book' | 'check' | 'lock' | 'trophy' | 'target' | 'briefcase' | 'spark';

export function AcademyIcon({
  name,
  className = '',
}: {
  name: AcademyIconName;
  className?: string;
}) {
  const paths: Record<AcademyIconName, string> = {
    star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
    book: 'M12 6C9 3 5 3 3 4v15c3-1 6-1 9 2m0-15c3-3 7-3 9-2v15c-3-1-6-1-9 2V6Z',
    check: 'm5 12 4 4L19 6',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M6 10h12v11H6Zm6 4v3',
    trophy: 'M7 3h10v6a5 5 0 0 1-10 0Zm0 2H3v3a5 5 0 0 0 5 5m9-8h4v3a5 5 0 0 1-5 5m-4 1v6m-4 1h8',
    target: 'M20 12a8 8 0 1 1-8-8m0 4a4 4 0 1 0 4 4m-4 0 9-9m-5 0h5v5',
    briefcase: 'M8 6V3h8v3M3 7h18v14H3Zm0 5a25 25 0 0 0 18 0m-9 0v4',
    spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z',
  };
  return (
    <svg
      className={`academy-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

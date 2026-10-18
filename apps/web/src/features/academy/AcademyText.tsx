const terms = new Map([
  ['جریان نقدی', 'Cash Flow'],
  ['ارزش پیشنهادی', 'Value Proposition'],
  ['مزیت رقابتی', 'Competitive Advantage'],
  ['هزینه فرصت', 'Opportunity Cost'],
  ['فرضیه', 'Hypothesis'],
  ['سود', 'Profit'],
  ['درآمد', 'Revenue'],
]);
const pattern = new RegExp(`(?<![\\p{L}])(${[...terms.keys()].join('|')})(?![\\p{L}])`, 'gu');

/** Keep technical language readable in RTL without changing the stored answer keys. */
export function AcademyText({ children }: { children: string }) {
  return (
    <>
      {children.split(pattern).map((part, i) =>
        terms.has(part) ? (
          <span className="academy-term" key={i}>
            <bdi dir="ltr" lang="en">
              {terms.get(part)}
            </bdi>{' '}
            <span>({part})</span>
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

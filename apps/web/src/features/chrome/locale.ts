/** Display-only conversion. Never apply this to IDs, URLs or stored API values. */
export function displayDigits(value: string, english: boolean) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return english
    ? value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String(Math.max(persian.indexOf(digit), arabic.indexOf(digit))),
      )
    : value.replace(
        /[0-9٠-٩]/g,
        (digit) => persian[/[0-9]/.test(digit) ? Number(digit) : arabic.indexOf(digit)],
      );
}

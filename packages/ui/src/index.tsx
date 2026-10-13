import type { ReactNode } from 'react';
import { BRAND, BRAND_MARK } from '../../../src/brand.js';
export function Brand({ english = false }: { english?: boolean }) {
  return (
    <span className="product-brand">
      <span className="product-mark" dangerouslySetInnerHTML={{ __html: BRAND_MARK }} />
      <strong>{english ? BRAND.en : BRAND.fa}</strong>
    </span>
  );
}
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="notice">
      <h1 tabIndex={-1}>{title}</h1>
      <div>{children}</div>
    </section>
  );
}
export { BRAND };

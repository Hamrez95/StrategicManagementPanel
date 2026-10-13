import { Component } from 'react';
import type { ReactNode } from 'react';
import { Notice } from '@stratino/ui';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <Notice title="نمایش صفحه کامل نشد">
          <p role="alert">صفحه را دوباره بارگذاری کنید. داده‌های نمونه در مرورگر باقی می‌مانند.</p>
          <button className="button" onClick={() => location.reload()}>
            بارگذاری دوباره
          </button>
          <a className="text-link" href="/prototype/">
            بازکردن نسخه نمونه
          </a>
        </Notice>
      );
    return this.props.children;
  }
}

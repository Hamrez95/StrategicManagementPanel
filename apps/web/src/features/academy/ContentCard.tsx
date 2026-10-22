import { useState } from 'react';
import { LearningImage } from './LearningImage';
import type { Card, Media, Unit } from './connectedData';

/** Preserve authored wording; isolate English runs and mathematical expressions in RTL. */
export function ContentText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(
          /([A-Za-z][A-Za-z0-9۰-۹٠-٩_ .%٪/()+−=÷×:*–-]*|[-−+]?[0-9۰-۹٠-٩][0-9۰-۹٠-٩.,٫٬\s]*[=÷×−+≈][0-9۰-۹٠-٩.,٫٬\s=÷×−+≈%٪]*)/g,
        )
        .map((part, index) =>
          index % 2 === 1 ? (
            <bdi dir="ltr" key={index}>
              {part}
            </bdi>
          ) : (
            part
          ),
        )}
    </>
  );
}
const mediaUrl = (ref: string) => `/academy-content/media/${ref.split('/').at(-1)}`;
export function LearningMedia({ asset }: { asset: Media }) {
  return (
    <figure className="learning-media">
      <LearningImage
        src={mediaUrl(asset.asset_ref)}
        mobileSrc={asset.mobile_asset_ref ? mediaUrl(asset.mobile_asset_ref) : undefined}
        alt={asset.alt_text ?? 'تصویر آموزشی'}
      />
      {asset.caption && (
        <figcaption>
          <ContentText text={asset.caption} />
        </figcaption>
      )}
      {asset.long_description && (
        <details>
          <summary>توضیح کامل تصویر</summary>
          <p>
            <ContentText text={asset.long_description} />
          </p>
        </details>
      )}
      {asset.source_url && (
        <a href={asset.source_url} target="_blank" rel="noreferrer">
          منبع تصویر
        </a>
      )}
    </figure>
  );
}
export function ContentCard({ card, unit }: { card: Card; unit: Unit }) {
  return (
    <article className={`learning-card learning-card--${card.type ?? 'explanation'}`} id={card.id}>
      <h2>
        <ContentText text={card.title} />
      </h2>
      <p className="learning-prose">
        <ContentText text={card.text} />
      </p>
      {card.elements && (
        <ol className="learning-concept-map">
          {card.elements.map((element, i) => (
            <li key={i}>
              <ContentText text={element} />
            </li>
          ))}
        </ol>
      )}
      {card.table && (
        <div className="learning-table-scroll" role="region" aria-label={card.title} tabIndex={0}>
          <table>
            <caption>{card.alt ?? card.title}</caption>
            <thead>
              <tr>
                {card.table.columns.map((column, i) => (
                  <th scope="col" key={i}>
                    <ContentText text={column} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <ContentText text={String(cell)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unit.media_plan?.display_on_card_id === card.id &&
        unit.media_plan.assets.map((asset) => (
          <LearningMedia key={asset.asset_ref} asset={asset} />
        ))}
      {card.source_url && (
        <a href={card.source_url} target="_blank" rel="noreferrer">
          منبع این مثال
        </a>
      )}
    </article>
  );
}

export function Worksheet({
  onChange,
  initial = '',
}: {
  onChange: (value: string) => void;
  initial?: string;
}) {
  const restore = () => {
    try {
      const value = JSON.parse(initial);
      if (Array.isArray(value.rows)) return value as { text: string; rows: string[][] };
    } catch {
      /* An earlier plain-text answer remains usable. */
    }
    return { text: initial, rows: [['', '', '']] };
  };
  const [sheet, setSheet] = useState(restore);
  function update(next: typeof sheet) {
    setSheet(next);
    onChange(JSON.stringify(next));
  }
  return (
    <div className="learning-worksheet">
      <label>
        پاسخت رو بنویس
        <textarea
          rows={6}
          maxLength={20000}
          value={sheet.text}
          onChange={(event) => update({ ...sheet, text: event.target.value })}
        />
      </label>
      <details>
        <summary>برگهٔ کار برای جدول، ماتریس یا بوم</summary>
        <p>
          می‌تونی عنوان خانه‌ها و داده‌ها رو متناسب با صورت تمرین بنویسی و ردیف یا ستون اضافه کنی.
        </p>
        <div className="learning-table-scroll" tabIndex={0}>
          <table>
            <caption>برگهٔ کار من</caption>
            <tbody>
              {sheet.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <label className="sr-only" htmlFor={`cell-${i}-${j}`}>
                        ردیف {i + 1}، ستون {j + 1}
                      </label>
                      <textarea
                        id={`cell-${i}-${j}`}
                        rows={2}
                        value={cell}
                        maxLength={1000}
                        onChange={(event) =>
                          update({
                            ...sheet,
                            rows: sheet.rows.map((r, ri) =>
                              r.map((v, ci) => (ri === i && ci === j ? event.target.value : v)),
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="learning-actions">
          <button
            type="button"
            disabled={sheet.rows.length >= 20}
            onClick={() => update({ ...sheet, rows: [...sheet.rows, sheet.rows[0].map(() => '')] })}
          >
            ردیف تازه
          </button>
          <button
            type="button"
            disabled={sheet.rows[0].length >= 9}
            onClick={() => update({ ...sheet, rows: sheet.rows.map((row) => [...row, '']) })}
          >
            ستون تازه
          </button>
        </div>
      </details>
    </div>
  );
}

const canvasBlocks = [
  'شرکای کلیدی',
  'فعالیت‌های کلیدی',
  'منابع کلیدی',
  'ارزش پیشنهادی',
  'رابطه با مشتری',
  'کانال‌ها',
  'بخش‌های مشتری',
  'ساختار هزینه',
  'جریان‌های درآمد',
];
export function StructuredWorksheet({
  kind,
  onChange,
  initial = '',
}: {
  kind: 'bmc' | 'matrix';
  onChange: (value: string) => void;
  initial?: string;
}) {
  const [sheet, setSheet] = useState(() => {
    try {
      const saved = JSON.parse(initial);
      if (typeof saved.text === 'string' && Array.isArray(saved.rows))
        return saved as { text: string; rows: string[][] };
    } catch {
      /* Plain answers remain readable. */
    }
    return {
      text: initial,
      rows:
        kind === 'bmc'
          ? canvasBlocks.map(() => [''])
          : Array.from({ length: 4 }, () => ['', '', '', '']),
    };
  });
  function update(next: typeof sheet) {
    setSheet(next);
    onChange(JSON.stringify(next));
  }
  function cell(row: number, column: number, value: string) {
    update({
      ...sheet,
      rows: sheet.rows.map((r, i) => r.map((v, j) => (i === row && j === column ? value : v))),
    });
  }
  return (
    <div className="learning-worksheet">
      <label>
        پاسخت رو بنویس
        <textarea
          rows={4}
          maxLength={12000}
          value={sheet.text}
          onChange={(event) => update({ ...sheet, text: event.target.value })}
        />
      </label>
      {kind === 'bmc' ? (
        <div className="learning-bmc" aria-label="بوم مدل کسب‌وکار">
          {canvasBlocks.map((title, index) => (
            <label key={title} className={`learning-bmc-block learning-bmc-block--${index}`}>
              <strong>{title}</strong>
              <textarea
                rows={4}
                maxLength={1500}
                value={sheet.rows[index]?.[0] ?? ''}
                onChange={(event) => {
                  const rows = canvasBlocks.map((_, i) => [sheet.rows[i]?.[0] ?? '']);
                  rows[index][0] = event.target.value;
                  update({ ...sheet, rows });
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <>
          <div
            className="learning-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="برگهٔ ماتریس"
          >
            <table>
              <caption>وزن، امتیاز پاسخ و شاهد رو جدا ثبت کن.</caption>
              <thead>
                <tr>
                  {['عامل', 'وزن', 'امتیاز پاسخ', 'شاهد و تاریخ'].map((title) => (
                    <th scope="col" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((value, j) => (
                      <td key={j}>
                        <label className="sr-only" htmlFor={`matrix-${i}-${j}`}>
                          ردیف {i + 1}، ستون {j + 1}
                        </label>
                        <textarea
                          id={`matrix-${i}-${j}`}
                          rows={2}
                          inputMode={j === 1 || j === 2 ? 'decimal' : 'text'}
                          value={value}
                          maxLength={1000}
                          onChange={(event) => cell(i, j, event.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={sheet.rows.length >= 20}
            onClick={() => update({ ...sheet, rows: [...sheet.rows, ['', '', '', '']] })}
          >
            عامل تازه
          </button>
        </>
      )}
    </div>
  );
}

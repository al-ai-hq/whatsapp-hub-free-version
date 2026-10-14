"use client";

import type { PreviewModel } from "@/lib/templatePreview";

/**
 * WhatsApp-style message preview. Purely presentational — every decision about
 * what to show lives in `buildTemplatePreview` (create form) or is passed in
 * directly (broadcast form), so the two surfaces can never drift apart
 * visually. Styling comes from the `.wa-preview*` classes in globals.css.
 */

const BTN_ICON: Record<string, string> = {
  URL: "\u{1F517}", PHONE_NUMBER: "\u{1F4DE}", COPY_CODE: "\u29C9", QUICK_REPLY: "\u21A9",
};

const HEADER_ICON: Record<string, string> = { IMAGE: "\u{1F4F7}", VIDEO: "\u{1F3AC}", DOCUMENT: "\u{1F4C4}" };

export default function WaPreview({ model, headerSet = false }: { model: PreviewModel; headerSet?: boolean }) {
  const { headerFormat, headerLabel, ltoText, body, footer, buttons, cards } = model;

  return (
    <div className="wa-preview">
      <div className="wa-preview__bubble">
        {headerFormat && (
          <div className={`wa-preview__media${headerSet ? " wa-preview__media--set" : ""}`}>
            {HEADER_ICON[headerFormat] ?? "\u{1F4C4}"} {headerLabel}
          </div>
        )}
        {ltoText && <div className="wa-preview__lto">{"\u23F3"} {ltoText}</div>}
        <div className="wa-preview__body" dir="auto">{body}</div>
        {footer && <div className="wa-preview__footer" dir="auto">{footer}</div>}
      </div>

      {cards && cards.length > 0 && (
        <div className="wa-preview__cards">
          {cards.map((c, i) => (
            <div key={i} className="wa-preview__card">
              <div className="wa-preview__cardmedia">
                {c.format === "VIDEO" ? "\u{1F3AC}" : "\u{1F4F7}"} {c.mediaLabel}
              </div>
              {c.body && <div dir="auto">{c.body}</div>}
              {c.buttonText && <span className="wa-preview__btn">{"\u{1F517}"} {c.buttonText}</span>}
            </div>
          ))}
        </div>
      )}

      {buttons.length > 0 && (
        <div className="wa-preview__btns">
          {buttons.map((b, i) => (
            <span key={i} className="wa-preview__btn">
              {BTN_ICON[b.type] ?? "\u21A9"} {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

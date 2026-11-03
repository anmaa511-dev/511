import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={"brand " + (light ? "light" : "")}
      href="/"
      aria-label="شنب، الرئيسية"
    >
      <img src="/logo-brand.png" alt="" />
      <span>
        <b>
          شنب<span className="brand-dot">.</span>
        </b>
        <small>للحلاقة الرجالية</small>
      </span>
    </a>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ) ?? [],
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    panel.current?.focus();
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", close);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

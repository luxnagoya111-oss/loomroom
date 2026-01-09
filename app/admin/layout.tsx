// app/admin/layout.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppHeader from "@/components/AppHeader";

type NavItem = {
  href: string;
  label: string;
  desc?: string;
};

const NAV: NavItem[] = [
  { href: "/admin/contact", label: "問い合わせ", desc: "Contact Tickets" },
  { href: "/admin/stores", label: "店舗", desc: "Stores" },
  { href: "/admin/therapists", label: "セラピスト", desc: "Therapists" },
  { href: "/admin/users", label: "ユーザー", desc: "Users" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/contact") return pathname === href || pathname.startsWith("/admin/contact/");
  return pathname === href;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <AppHeader title="管理" subtitle="Admin Console" showBack={true} />

      <div className="admin-body">
        <aside className="admin-aside">
          <div className="admin-aside-head">
            <div className="admin-aside-title">Admin</div>
            <div className="admin-aside-sub">PCでの運用を前提に最適化</div>
          </div>

          <nav className="admin-nav">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={"admin-nav-item" + (active ? " is-active" : "")}
                >
                  <div className="admin-nav-label">{item.label}</div>
                  {item.desc && <div className="admin-nav-desc">{item.desc}</div>}
                </Link>
              );
            })}
          </nav>

          <div className="admin-aside-foot">
            <div className="admin-foot-hint">
              URLで直リンクしてもOK（/admin/contact など）
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <div className="admin-main-inner">{children}</div>
        </main>
      </div>

      <style jsx>{`
        .admin-shell {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text-main);
          display: flex;
          flex-direction: column;
        }

        .admin-body {
          flex: 1;
          display: flex;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          gap: 14px;
          padding: 12px 12px 20px;
        }

        .admin-aside {
          width: 260px;
          flex-shrink: 0;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          padding: 12px;
          position: sticky;
          top: 64px; /* AppHeader(48) + 余白 */
          height: calc(100vh - 80px);
          overflow: auto;
        }

        .admin-aside-head {
          padding: 6px 6px 10px;
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 10px;
        }
        .admin-aside-title {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .admin-aside-sub {
          margin-top: 2px;
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.5;
        }

        .admin-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .admin-nav-item {
          text-decoration: none;
          color: inherit;
          border-radius: 14px;
          border: 1px solid var(--border-soft, rgba(0, 0, 0, 0.06));
          background: var(--surface-soft, rgba(255, 255, 255, 0.9));
          padding: 10px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          transition: transform 0.08s ease, border-color 0.08s ease;
        }
        .admin-nav-item:hover {
          transform: translateY(-1px);
          border-color: rgba(215, 185, 118, 0.45);
        }
        .admin-nav-item.is-active {
          border-color: rgba(215, 185, 118, 0.8);
          box-shadow: 0 0 0 1px rgba(215, 185, 118, 0.18);
        }

        .admin-nav-label {
          font-size: 13px;
          font-weight: 700;
        }
        .admin-nav-desc {
          font-size: 11px;
          color: var(--text-sub);
        }

        .admin-aside-foot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border-light);
        }
        .admin-foot-hint {
          font-size: 11px;
          color: var(--text-sub);
          line-height: 1.6;
        }

        .admin-main {
          flex: 1;
          min-width: 0;
        }

        .admin-main-inner {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
          padding: 14px;
          min-height: 60vh;
        }

        /* ====== Mobile ====== */
        @media (max-width: 860px) {
          .admin-body {
            flex-direction: column;
            padding: 10px 10px 16px;
          }
          .admin-aside {
            position: relative;
            top: auto;
            height: auto;
            width: 100%;
          }
          .admin-nav {
            flex-direction: row;
            overflow-x: auto;
            padding-bottom: 4px;
          }
          .admin-nav-item {
            min-width: 170px;
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
}
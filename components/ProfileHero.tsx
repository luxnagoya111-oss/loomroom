// components/ProfileHero.tsx
"use client";

import React from "react";
import Link from "next/link";
import AvatarCircle from "@/components/AvatarCircle";
import { RelationActions } from "@/components/RelationActions";
import type { RelationFlags } from "@/lib/repositories/relationRepository";

type RelatedLink = {
  label: string;
  href: string;
};

type Props = {
  // display
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  avatarInitial: string;
  roleLabel: string;
  areaLabel: string;

  intro?: string | null;
  loadingProfile: boolean;

  // counts
  postsCount: number;
  canShowCounts: boolean;
  loadingCounts: boolean;
  followingCount: number | null;
  followerCount: number | null;
  followingHref: string;
  followerHref: string;

  // dm/edit
  canShowDm: boolean;
  targetUserId: string; // /messages/new?to=
  canEdit: boolean;
  editHref: string;

  // relations
  canShowRelationUi: boolean;
  relations: RelationFlags;
  onToggleFollow: () => void;
  onToggleMute: () => void;
  onToggleBlock: () => void;

  // related links
  relatedLinks?: RelatedLink[];
};

function normalizeRelatedLinks(links?: RelatedLink[]): RelatedLink[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => ({
      label: typeof l?.label === "string" ? l.label.trim() : "",
      href: typeof l?.href === "string" ? l.href.trim() : "",
    }))
    .filter((l) => !!l.label && !!l.href);
}

const ProfileHero: React.FC<Props> = (props) => {
  const {
    displayName,
    handle,
    avatarUrl,
    avatarInitial,
    roleLabel,
    areaLabel,
    intro,
    loadingProfile,

    postsCount,
    canShowCounts,
    loadingCounts,
    followingCount,
    followerCount,
    followingHref,
    followerHref,

    canShowDm,
    targetUserId,
    canEdit,
    editHref,

    canShowRelationUi,
    relations,
    onToggleFollow,
    onToggleMute,
    onToggleBlock,

    relatedLinks,
  } = props;

  const links = normalizeRelatedLinks(relatedLinks);

  return (
    <>
      <section className="profile-hero">
        <div className="profile-hero-row">
          {/* ★ アバターを「上」に寄せる */}
          <div className="avatar-slot">
            <AvatarCircle
              className="avatar-circle"
              size={48}
              avatarUrl={avatarUrl ?? null}
              displayName={displayName}
              fallbackText={avatarInitial}
              alt=""
            />
          </div>

          <div className="profile-hero-main">
            {/* ★ 名前行を基準に、アバターと揃って見えるようにする */}
            <div className="name-line">
              <div className="name-block">
                <div className="name">{displayName}</div>

                <div className="handle-row">
                  <span className="handle">{handle}</span>

                  {canShowDm && (
                    <Link
                      href={`/messages/new?to=${targetUserId}`}
                      className="icon-btn no-link-style"
                      aria-label="DM"
                      title="DM"
                    >
                      ✉
                    </Link>
                  )}

                  {canEdit && (
                    <Link
                      href={editHref}
                      className="icon-btn no-link-style"
                      aria-label="編集"
                      title="編集"
                    >
                      ✎
                    </Link>
                  )}
                </div>
              </div>
            </div>

            <div className="meta-row">
              <span>アカウント種別：{roleLabel}</span>
              <span>エリア：{areaLabel || "未設定"}</span>
            </div>

            <div className="stats-row">
              <span>
                投稿 <strong>{postsCount}</strong>
              </span>

              <span>
                フォロー中{" "}
                <strong>
                  {canShowCounts ? (
                    <Link href={followingHref} className="stats-link">
                      {loadingCounts ? "…" : followingCount ?? "–"}
                    </Link>
                  ) : (
                    "–"
                  )}
                </strong>
              </span>

              <span>
                フォロワー{" "}
                <strong>
                  {canShowCounts ? (
                    <Link href={followerHref} className="stats-link">
                      {loadingCounts ? "…" : followerCount ?? "–"}
                    </Link>
                  ) : (
                    "–"
                  )}
                </strong>
              </span>
            </div>

            {canShowRelationUi && !canEdit && (
              <RelationActions
                flags={relations}
                onToggleFollow={onToggleFollow}
                onToggleMute={onToggleMute}
                onToggleBlock={onToggleBlock}
                onReport={() => {
                  alert("このアカウントの通報を受け付けました（現在はテスト用です）。");
                }}
              />
            )}
          </div>
        </div>

        {loadingProfile && (
          <p className="intro" style={{ opacity: 0.7 }}>
            プロフィールを読み込んでいます…
          </p>
        )}

        {!loadingProfile && intro && <p className="intro">{intro}</p>}

        {/* ★ 関連リンク（区切り線なし／可変個数OK） */}
        {!loadingProfile && links.length > 0 && (
          <div className="profile-hero-links">
            <div className="profile-hero-links-title">関連リンク</div>
            <div className="profile-hero-links-list">
              {links.map((l, i) => (
                <a
                  key={`${l.href}-${i}`}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="profile-hero-link-chip"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <style jsx>{`
        .profile-hero {
          padding: 4px 0 12px;
          margin-bottom: 8px;
          background: var(--surface); /* ★追加 */
        }

        .profile-hero::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 1px;
          background: var(--surface);
        }

        .profile-hero-row {
          display: flex;
          gap: 12px;
          align-items: flex-start; /* ★ここが重要：中央寄せをやめて上揃え */
          margin-bottom: 8px;
        }

        .avatar-slot {
          flex: 0 0 auto;
          padding-top: 2px; /* ★名前のベースラインに寄せる微調整 */
        }

        .profile-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .name-line {
          display: flex;
          align-items: flex-start;
        }

        .name-block {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .name {
          font-size: 16px;
          font-weight: 600;
          line-height: 1.2;
        }

        .handle-row {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .handle {
          font-size: 12px;
          color: var(--text-sub);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
        }

        .icon-btn {
          font-size: 14px;
          opacity: 0.85;
        }
        .icon-btn:hover {
          opacity: 1;
        }

        .meta-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .stats-row {
          font-size: 11px;
          color: var(--text-sub);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .intro {
          font-size: 13px;
          line-height: 1.7;
          margin-top: 6px;
        }

        /* ===== related links (no divider) ===== */
        .profile-hero-links {
          margin-top: 10px;
        }

        .profile-hero-links-title {
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 4px;
        }

        .profile-hero-links-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .profile-hero-link-chip {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-main);
          text-decoration: none;
        }

        :global(.no-link-style) {
          color: inherit;
          text-decoration: none;
        }

        .stats-link {
          color: inherit;
          text-decoration: none;
        }
        .stats-link:hover {
          opacity: 0.9;
        }
      `}</style>
    </>
  );
};

export default ProfileHero;
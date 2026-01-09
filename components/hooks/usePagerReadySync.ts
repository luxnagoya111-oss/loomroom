/**
 * 認証ガードや条件付きレンダリング下で、
 * URL(tab) → scroll / pager 同期が初回に死ぬ問題の対策用 hook。
 * DOM 出現（pagerReady）をトリガに必ず再同期する。
 */

import { useCallback, useEffect, useRef, useState } from "react";

type Options<TabKey extends string> = {
  isEnabled: boolean;              // isLoggedIn など
  initialTab: TabKey;
  getTabFromUrl: () => TabKey;     // normalizeTab(searchParams.get("tab"))
  onTabChange: (tab: TabKey) => void;
  scrollToTab: (tab: TabKey, behavior: ScrollBehavior) => void;
};

export function usePagerReadySync<TabKey extends string>({
  isEnabled,
  initialTab,
  getTabFromUrl,
  onTabChange,
  scrollToTab,
}: Options<TabKey>) {
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [pagerReady, setPagerReady] = useState(false);

  const setPagerRef = useCallback((node: HTMLDivElement | null) => {
    pagerRef.current = node;
    setPagerReady(!!node);
  }, []);

  // pager が DOM に出現した瞬間に URL(tab) を正として同期
  useEffect(() => {
    if (!pagerReady) return;
    if (!isEnabled) return;

    const tab = getTabFromUrl() ?? initialTab;
    onTabChange(tab);
    scrollToTab(tab, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagerReady, isEnabled]);

  return {
    pagerRef,
    setPagerRef,
    pagerReady,
  };
}
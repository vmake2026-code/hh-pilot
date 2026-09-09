import { describe, it, expect, vi } from "vitest";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";

// P30: прямой тест РЕАЛЬНОГО features/use-client-data.ts — hydration-safety
// regression zone (P27) до этого опиралась только на verbatim-копию внутри
// hh-wizard-page-flow.test.ts; при изменении реального хука ни один тест
// не падал. Здесь исполняется сам production-модуль.

import { useClientData } from "../../features/use-client-data";

interface Probe {
  data: unknown;
  ready: boolean;
  refresh: () => void;
}

// Renders a probe component that records every useClientData result.
// Async act() is required so the mount effect (loader read) is flushed
// before assertions — same pattern as hh-wizard-page-flow.test.ts.
async function renderProbe(loader: () => unknown): Promise<{
  probes: Probe[];
  rerender: (nextLoader: () => unknown) => Promise<void>;
  unmount: () => void;
}> {
  const probes: Probe[] = [];
  let currentLoader = loader;

  function ProbeComponent() {
    const result = useClientData(currentLoader);
    probes.push(result);
    return createElement("div");
  }

  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(createElement(ProbeComponent));
  });

  return {
    probes,
    async rerender(nextLoader: () => unknown) {
      currentLoader = nextLoader;
      await act(async () => {
        tree.update(createElement(ProbeComponent));
      });
    },
    unmount() {
      act(() => {
        tree.unmount();
      });
    },
  };
}

describe("useClientData (real hook) — P30 direct coverage", () => {
  it("first render: data=null, ready=false (SSR/hydration contract)", async () => {
    const { probes, unmount } = await renderProbe(() => "value");
    const first = probes[0];
    expect(first.data).toBeNull();
    expect(first.ready).toBe(false);
    unmount();
  });

  it("after mount effect: loader ran once, data set, ready=true", async () => {
    const loader = vi.fn(() => "loaded");
    const { probes, unmount } = await renderProbe(loader);

    const settled = probes[probes.length - 1];
    expect(settled.data).toBe("loaded");
    expect(settled.ready).toBe(true);
    // Load effect ran exactly once on mount
    expect(loader).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("changing loader identity does NOT re-run the load (no reload loops)", async () => {
    const first = vi.fn(() => "one");
    const second = vi.fn(() => "two");
    const { probes, rerender, unmount } = await renderProbe(first);

    await rerender(second);
    await rerender(second);

    // Only the mount-time load happened; the latest loader is kept in a ref
    // but the load effect (nonce-keyed) never re-fires from identity changes.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    const settled = probes[probes.length - 1];
    expect(settled.data).toBe("one");
    unmount();
  });

  it("refresh() re-runs the LATEST loader and updates data", async () => {
    let counter = 0;
    const loader = vi.fn(() => {
      counter += 1;
      return `load-${counter}`;
    });
    const { probes, unmount } = await renderProbe(loader);
    let settled = probes[probes.length - 1];
    expect(settled.data).toBe("load-1");

    await act(async () => {
      settled.refresh();
    });

    settled = probes[probes.length - 1];
    expect(loader).toHaveBeenCalledTimes(2);
    expect(settled.data).toBe("load-2");
    expect(settled.ready).toBe(true);
    unmount();
  });

  it("refresh() uses the newest loader after a rerender", async () => {
    const initial = vi.fn(() => "initial");
    const latest = vi.fn(() => "latest");
    const { probes, rerender, unmount } = await renderProbe(initial);
    await rerender(latest);

    let settled = probes[probes.length - 1];
    await act(async () => {
      settled.refresh();
    });

    settled = probes[probes.length - 1];
    expect(latest).toHaveBeenCalledTimes(1);
    expect(settled.data).toBe("latest");
    unmount();
  });

  it("ready stays true after refresh (no ready-flap)", async () => {
    const { probes, unmount } = await renderProbe(() => "v");
    const settled = probes[probes.length - 1];
    await act(async () => {
      settled.refresh();
    });
    // No intermediate ready:false render after the initial load
    for (const p of probes.slice(1)) {
      expect(p.ready).toBe(true);
    }
    unmount();
  });
});

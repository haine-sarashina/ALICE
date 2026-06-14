import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("DEFAULT_SETTINGS", () => {
  it("has correct editor defaults", () => {
    expect(DEFAULT_SETTINGS.editor.autoSave).toBe(false);
    expect(DEFAULT_SETTINGS.editor.fontSize).toBe(13);
  });

  it("has 9 widget items", () => {
    expect(DEFAULT_SETTINGS.widgets.items).toHaveLength(9);
  });

  it("has correct widget defaults", () => {
    expect(DEFAULT_SETTINGS.widgets.photoInterval).toBe(10);
    expect(DEFAULT_SETTINGS.widgets.newsInterval).toBe(30);
    expect(DEFAULT_SETTINGS.widgets.photoFolder).toBeNull();
    expect(DEFAULT_SETTINGS.widgets.newsKeywords).toEqual([]);
  });

  it("clock widget is visible by default", () => {
    const clock = DEFAULT_SETTINGS.widgets.items.find((w) => w.id === "clock");
    expect(clock?.visible).toBe(true);
  });

  it("has showHidden false by default", () => {
    expect(DEFAULT_SETTINGS.files.showHidden).toBe(false);
  });
});

describe("loadSettings", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("returns settings from invoke", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...DEFAULT_SETTINGS });
    const settings = await loadSettings();
    expect(settings.editor.fontSize).toBe(13);
  });

  it("merges missing widgets from DEFAULT_SETTINGS", async () => {
    const partial = {
      ...DEFAULT_SETTINGS,
      widgets: {
        ...DEFAULT_SETTINGS.widgets,
        items: [{ id: "clock", visible: true }],
      },
    };
    vi.mocked(invoke).mockResolvedValue(partial);
    const settings = await loadSettings();
    expect(settings.widgets.items.length).toBe(9);
  });

  it("does not duplicate existing widgets", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...DEFAULT_SETTINGS });
    const settings = await loadSettings();
    const ids = settings.widgets.items.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves existing widget visibility", async () => {
    const modified = {
      ...DEFAULT_SETTINGS,
      widgets: {
        ...DEFAULT_SETTINGS.widgets,
        items: DEFAULT_SETTINGS.widgets.items.map((w) =>
          w.id === "clock" ? { ...w, visible: false } : w
        ),
      },
    };
    vi.mocked(invoke).mockResolvedValue(modified);
    const settings = await loadSettings();
    const clock = settings.widgets.items.find((w) => w.id === "clock");
    expect(clock?.visible).toBe(false);
  });
});
